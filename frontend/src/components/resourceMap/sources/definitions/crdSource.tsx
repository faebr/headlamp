import { Icon } from '@iconify/react';
import { useMemo } from 'react';
import CRD from '../../../../lib/k8s/crd';
import { useNamespaces } from '../../../../redux/filterSlice';
import { GraphEdge, GraphSource } from '../../graph/graphModel';
import { getKindGroupColor, KubeIcon } from '../../kubeIcon/KubeIcon';
import { kubeOwnersEdgesReversed, makeKubeObjectNode, sourceRefEdges } from '../GraphSources';

export function crdSource(crds: CRD[]): GraphSource {
  const groupedSources = new Map<string, GraphSource[]>();

  for (const crd of crds) {
    const source = {
      id: 'cr-' + crd.getName(),
      label: crd.spec.names.kind,
      icon: (
        <Icon
          icon="mdi:select-group"
          width="100%"
          height="100%"
          color={getKindGroupColor('other')}
        />
      ),
      useData: () => {
        const crClass = crd.makeCRClass();
        const [crInstances, error] = crClass.useList({
          cluster: crd.cluster,
          namespace: useNamespaces(),
        });
        return useMemo(() => {
          if (!crInstances || !!error) {
            console.error('error:', error);
            return null;
          }
          const kubeOwnerEdges = crInstances.map(kubeOwnersEdgesReversed).flat() ?? [];
          const relationEdges: GraphEdge[] = crInstances.map(sourceRefEdges).flat() ?? [];
          return {
            nodes: crInstances.map(makeKubeObjectNode) ?? [],
            edges: [...kubeOwnerEdges, ...relationEdges],
          };
        }, [crInstances, error]);
      },
    };

    if (!groupedSources.has(crd.spec.group)) {
      groupedSources.set(crd.spec.group, []);
    }

    groupedSources.get(crd.spec.group)?.push(source);
  }

  const finalSources: GraphSource[] = [];
  groupedSources.forEach((sources, group) => {
    finalSources.push({
      id: 'crd-' + group,
      label: group,
      icon: <Icon icon="mdi:group" width="100%" height="100%" color={getKindGroupColor('other')} />,
      sources: sources,
    });
  });

  return {
    id: 'crs',
    label: 'CRs',
    icon: <KubeIcon kind="CustomResourceDefinition" />,
    sources: finalSources,
  };
}
