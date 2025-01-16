import { groupBy } from 'lodash';
import Pod from '../../../lib/k8s/pod';
import { makeGraphLookup } from './graphLookup';
import {
  forEachNode,
  GraphEdge,
  GraphNode,
  GroupNode,
  isGroup,
  KubeGroupNode,
  KubeObjectNode,
} from './graphModel';

export type GroupBy = 'node' | 'namespace' | 'instance' | 'crd';

/**
 * Returns the amount of nodes in the graph
 */
export const getGraphSize = (graph: GraphNode) => {
  let size = 0;
  forEachNode(graph, () => {
    size++;
  });
  return size;
};

/**
 * Identifies and groups connected components from a set of nodes and edges.
 * Unlike a pure tree/forest approach, this version preserves loops (cycles).
 *
 * @param nodes - An array of `KubeObjectNode` representing the nodes in the graph
 * @param edges - An array of `GraphEdge` representing the edges in the graph
 * @returns An array of `GraphNode` where each element is either a single node
 *          or a group node containing multiple nodes and edges
 */
const getConnectedComponents = (nodes: KubeObjectNode[], edges: GraphEdge[]): GraphNode[] => {
  const components: KubeGroupNode[] = [];
  const graphLookup = makeGraphLookup(nodes, edges);

  const visitedNodes = new Set<string>();
  // Used to avoid inserting the same edge into the component multiple times
  const visitedEdges = new Set<string>();

  /**
   * Recursively traverses the graph from `node`, collecting both nodes and edges
   * into the same connected component. We do NOT remove loops/cycles. If we reach
   * a node that is already visited, we simply do NOT recurse further, but we still
   * add that edge to `componentEdges`.
   */
  const findConnectedComponent = (
    node: KubeObjectNode,
    componentNodes: KubeObjectNode[],
    componentEdges: GraphEdge[]
  ) => {
    visitedNodes.add(node.id);
    componentNodes.push(node);

    // Handle outgoing edges
    graphLookup.getOutgoingEdges(node.id)?.forEach(edge => {
      // Always include this edge if we haven't already
      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        componentEdges.push(edge);
      }
      // Only recurse if the target node hasn't been visited
      const targetNode = graphLookup.getNode(edge.target);
      if (targetNode && !visitedNodes.has(targetNode.id)) {
        findConnectedComponent(targetNode, componentNodes, componentEdges);
      }
    });

    // Handle incoming edges
    graphLookup.getIncomingEdges(node.id)?.forEach(edge => {
      // Always include this edge if we haven't already
      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        componentEdges.push(edge);
      }
      // Only recurse if the source node hasn't been visited
      const sourceNode = graphLookup.getNode(edge.source);
      if (sourceNode && !visitedNodes.has(sourceNode.id)) {
        findConnectedComponent(sourceNode, componentNodes, componentEdges);
      }
    });
  };

  // Iterate over each node and find connected components
  nodes.forEach(node => {
    if (!visitedNodes.has(node.id)) {
      const componentNodes: KubeObjectNode[] = [];
      const componentEdges: GraphEdge[] = [];
      findConnectedComponent(node, componentNodes, componentEdges);

      const mainNode = getMainNode(componentNodes);
      const id = 'group-' + mainNode.id;

      components.push({
        id,
        type: 'kubeGroup',
        data: {
          label: mainNode.data.resource.metadata.name,
          nodes: componentNodes,
          edges: componentEdges,
        },
      });
    }
  });

  // If a group only has one node, return just the single node instead of a kubeGroup
  return components.map(group => (group.data.nodes.length === 1 ? group.data.nodes[0] : group));
};

/**
 * Try to find a "main" node in the workload group
 * If can't find anything return the first node
 */
export const getMainNode = (nodes: KubeObjectNode[]) => {
  const deployment = nodes.find(it => it.data.resource.kind === 'Deployment');
  const replicaSet = nodes.find(it => it.data.resource.kind === 'ReplicaSet');
  const daemonSet = nodes.find(it => it.data.resource.kind === 'DaemonSet');
  const statefulSet = nodes.find(it => it.data.resource.kind === 'StatefulSet');
  const job = nodes.find(it => it.data.resource.kind === 'Job');

  return deployment ?? replicaSet ?? daemonSet ?? statefulSet ?? job ?? nodes[0];
};

/**
 * Groups a list of nodes into 'group' type nodes
 * Grouping property is determined by the accessor
 *
 * @param nodes - list of nodes
 * @param accessor - function returning which property to group by
 * @param param.label - label prefix for the group
 * @param param.allowSingleMemberGroup - won't create groups with single members if set to false
 * @returns List of created groups
 */
const groupByProperty = (
  nodes: GraphNode[],
  accessor: (n: GraphNode) => string | null | undefined,
  {
    label,
    allowSingleMemberGroup = false,
  }: {
    label: string;
    allowSingleMemberGroup?: boolean;
  }
) => {
  const groups = Object.entries(
    groupBy(nodes, node => {
      return accessor(node);
    })
  ).map(
    ([property, components]): GroupNode => ({
      id: label + '-' + property,
      type: 'group',
      data: {
        nodes: components,
        edges: [],
        label: label + ': ' + property,
      },
    })
  );

  const result = groups.flatMap(it => {
    const nonGroup = it.id.includes('undefined');
    const hasOneMember = it.data.nodes.length === 1;

    // If property is 'undefined' or group has only one node, we might just return the node(s) instead
    return nonGroup || (hasOneMember && !allowSingleMemberGroup) ? it.data.nodes : [it];
  });

  return result;
};

/**
 * Groups the graph into separate 'group' Nodes
 * Nodes within groups are sorted by size
 *
 * @param nodes - List of nodes
 * @param edges - List of edges
 * @param params.groupBy - group by which property
 * @returns Graph, a single root node with groups as its children
 */
export function groupGraph(
  nodes: KubeObjectNode[],
  edges: GraphEdge[],
  { groupBy }: { groupBy?: GroupBy }
): GroupNode {
  const root: GroupNode = {
    id: 'root',
    type: 'group',
    data: {
      label: 'root',
      nodes: [],
      edges: [],
    },
  };

  // Now preserves loops because we don’t skip edges that form cycles
  let components: GraphNode[] = getConnectedComponents(nodes, edges);
  console.log('components:', components);

  if (groupBy === 'namespace') {
    // Create groups based on the Kube resource namespace
    components = groupByProperty(
      components,
      component => {
        if (component.type === 'kubeGroup') {
          return component.data.nodes[0].data.resource.metadata.namespace;
        }
        if (component.type === 'group') {
          return null;
        }
        if (component.type === 'kubeObject') {
          return component.data.resource.metadata.namespace;
        }
      },
      { label: 'Namespace', allowSingleMemberGroup: true }
    );
  }

  if (groupBy === 'node') {
    // Create groups based on the Kube resource node (i.e. Pod.spec.nodeName)
    components = groupByProperty(
      components,
      component => {
        if (component.type === 'kubeGroup') {
          const maybePod = component.data.nodes.find(it => it.data.resource?.kind === 'Pod')?.data
            ?.resource as Pod | undefined;
          return maybePod?.spec?.nodeName;
        }
        if (component.type === 'group') {
          return null;
        }
        if (component.type === 'kubeObject') {
          return (component.data.resource as Pod)?.spec?.nodeName;
        }
      },
      { label: 'Node', allowSingleMemberGroup: true }
    );
  }

  if (groupBy === 'instance') {
    // Create groups based on the instance label from metadata (if it exists)
    components = groupByProperty(
      components,
      node => {
        if (node.type === 'kubeGroup') {
          const mainNode = getMainNode(node.data.nodes);
          return mainNode.data.resource?.metadata?.labels?.['app.kubernetes.io/instance'];
        }
        if (node.type === 'kubeObject') {
          return node.data.resource.metadata?.labels?.['app.kubernetes.io/instance'];
        }
        return undefined;
      },
      { label: 'Instance' }
    );
  }

  if (groupBy === 'crd') {
    // Create groups based on the Kube resource kind
    components = groupByProperty(
      components,
      component => {
        if (component.type === 'kubeGroup') {
          return component.data.nodes[0].data.resource.kind;
        }
        if (component.type === 'group') {
          return null;
        }
        if (component.type === 'kubeObject') {
          return component.data.resource.kind;
        }
      },
      { label: 'CRD', allowSingleMemberGroup: true }
    );
  }

  // Add all components (groups or single nodes) under the root
  root.data.nodes.push(...components);

  // Sort nodes within each group node
  forEachNode(root, node => {
    const getNodeWeight = (n: GraphNode) => {
      if (n.type === 'group') {
        return 100 + n.data.nodes.length;
      }
      if (n.type === 'kubeGroup') {
        return n.data.nodes.length;
      }
      return 1;
    };
    if ('nodes' in node.data) {
      node.data?.nodes?.sort((a, b) => getNodeWeight(b) - getNodeWeight(a));
    }
  });

  return root;
}

/**
 * Walks the graph to find the parent of the given node
 */
export function getParentNode(graph: GraphNode, elementId: string): GraphNode | undefined {
  let result: GraphNode | undefined;

  forEachNode(graph, node => {
    if (isGroup(node)) {
      if (node.data.nodes.find(it => it.id === elementId)) {
        result = node;
      }
    }
  });

  return result;
}

/**
 * Finds a Node with a group type that contains a given node
 * @param graph - graph which contains the Node
 * @param elementId - ID of a given Node
 * @returns
 */
export function findGroupContaining(graph: GraphNode, elementId: string): GraphNode | undefined {
  // Not a group
  if (!isGroup(graph)) return undefined;

  // The group itself is selected
  if (graph.id === elementId) return graph;

  // Node is inside this group?
  if (graph.data.nodes.find(it => it.id === elementId && !isGroup(it))) {
    return graph;
  }

  if ('nodes' in graph.data) {
    let res: GraphNode | undefined;
    graph.data.nodes?.some(it => {
      const group = findGroupContaining(it, elementId);
      if (group) {
        res = group;
        return true;
      }
      return false;
    });
    if (res) {
      return res;
    }
  }

  return undefined;
}

/**
 * Given a graph with groups, this function will 'collapse' all groups that
 * do not contain the selected node. 'Collapsing' means that group won't show
 * all children but only a preview.
 *
 * If selectedNodeId is passed, only shows the group containing that node.
 *
 * @param graph         A single graph node (root or group)
 * @param params        Collapse params
 * @param params.selectedNodeId Node that is selected
 * @param params.expandAll       Display all the children within all groups
 * @returns Collapsed graph
 */
export function collapseGraph(
  graph: GroupNode | KubeGroupNode,
  { selectedNodeId, expandAll }: { selectedNodeId?: string; expandAll: boolean }
) {
  let root = { ...graph };
  let selectedGroup: GraphNode | undefined;

  if (selectedNodeId) {
    selectedGroup = findGroupContaining(graph, selectedNodeId);
  }

  /**
   * Recursively collapse children
   */
  const collapseGroup = (group: GraphNode): GraphNode => {
    if (group.type !== 'kubeGroup' && group.type !== 'group') {
      return group;
    }

    const collapsed = expandAll
      ? false
      : group.type === 'kubeGroup' && selectedGroup?.id !== group.id;

    return {
      ...group,
      data: {
        ...group.data,
        nodes: group.data.nodes?.map(collapseGroup),
        edges: !collapsed ? group.data.edges : [],
        collapsed,
      },
    } as GraphNode;
  };

  // If we do have a selected group and it’s not the root, shrink everything else
  if (selectedGroup && selectedGroup.id !== 'root') {
    root.data = {
      ...root.data,
      nodes: [selectedGroup],
    };
  }

  root = collapseGroup(root) as GroupNode;
  return root;
}
