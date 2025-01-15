import { Icon } from '@iconify/react';
import { useMemo } from 'react';
import CRD from '../../../../lib/k8s/crd';
import { KubeObject } from '../../../../lib/k8s/KubeObject';
import { useNamespaces } from '../../../../redux/filterSlice';
import { GraphEdge, GraphSource } from '../../graph/graphModel';
import { getKindGroupColor, KubeIcon } from '../../kubeIcon/KubeIcon';
import { makeKubeObjectNode } from '../GraphSources';

/*
function getCrdSources() {
  let sources: GraphSource[] = [];
  let testCrds = ["ipaddressclaims.netbox.dev", "ipaddresses.netbox.dev"];
  for (const crd of testCrds) {
    sources.push({
      id: 'crd-' + crd, //TODO: Change to dynamic
      label: 'test',
      icon: <KubeIcon kind="CustomResourceDefinition" />,
      useData() {
        const [crdResource, error] = CRD.useGet(crd);
        if (error || crdResource == null) return null
        const crClass = crdResource.makeCRClass();
        console.log(crClass)

        const crClassList = crClass.useList({ cluster: crdResource.cluster });
        // console.log(crClassList)

        return useMemo(() => {
          // if (!crClassList || !!error) {
          //   return {
          //     nodes: [],
          //     edges: [],
          //   };
          // }

          // const queries = dataClassCrds.map(it => it.data);
          // const crs = queries.filter(crd => crd.items != null && crd.items.length > 0);

          // const edges: GraphEdge[] = [];
          // find used pvc
          // pods.forEach(pod => {
          //   pod.spec.volumes?.forEach(volume => {
          //     if (volume.persistentVolumeClaim) {
          //       const crd = crds.find(
          //         crd => crd.metadata.name === volume.persistentVolumeClaim!.claimName
          //       );
          //       if (crd) {
          //         edges.push(makeKubeToKubeEdge(crd, pod));
          //       }
          //     }
          //   });
          // });

          return {
            nodes: [],
            edges: [],
          };
        }, []);

      },
    });
  }
  return sources;
}

function getCRInstances () {
  // const [crds, error] = CRD.useList( {fieldSelector: "metadata.name=ipaddressclaims.netbox.dev"});
  // const crdClass = crd?.makeCRClass();
  // const data = crdClass?.useList({ cluster: crd.cluster, namespace: useNamespaces() });
  // const dataClassCrds = crds?.map(crd => {
  //   return { data, crdClass, crd };
  // });
  // return dataClassCrds
}

function crdSources() {
  let testCrds = ["ipaddressclaims.netbox.dev", "ipaddresses.netbox.dev"];
  let sources: GraphSource[] = [];
  testCrds.forEach(crdName => {
    const [crd, _] = CRD.useGet(crdName);
    if (crd == null) return;
    const cr = crd.makeCRClass();
    sources.push({
      id: 'crd-' + "ipaddressclaims.netbox.dev", //TODO: Change to dynamic
      label: 'test',
      icon: <KubeIcon kind="CustomResourceDefinition" />,
      useData() {
        const crs = cr.useList({namespace: useNamespaces()})
        console.log(crs)
        return useMemo(() => {
          if (!crs) return null;
    
          return {
            nodes: [],
            edges: [],
          };
        }, [crs]);
      }
    });
  });
  return sources;
}

const demoSource: GraphSource = {
  id: 'crd-' + "ipaddressclaims.netbox.dev", //TODO: Change to dynamic
  label: 'test',
  icon: <KubeIcon kind="CustomResourceDefinition" />,
  useData() {
    const namespace = useNamespaces()
    
    const crs = cr?.useList({namespace: namespace})
    
    return useMemo(() => {
      if (!crs) return null;
  
      // console.log(crClassList)
      // if (!crClassList || !!error) {
      //   return {
      //     nodes: [],
      //     edges: [],
      //   };
      // }

      // const queries = dataClassCrds.map(it => it.data);
      // const crs = queries.filter(crd => crd.items != null && crd.items.length > 0);

      // const edges: GraphEdge[] = [];
      // find used pvc
      // pods.forEach(pod => {
      //   pod.spec.volumes?.forEach(volume => {
      //     if (volume.persistentVolumeClaim) {
      //       const crd = crds.find(
      //         crd => crd.metadata.name === volume.persistentVolumeClaim!.claimName
      //       );
      //       if (crd) {
      //         edges.push(makeKubeToKubeEdge(crd, pod));
      //       }
      //     }
      //   });
      // });

      return {
        nodes: [],
        edges: [],
      };
    }, [crs]);
  }
};

function createSource(crd): GraphSource {
  return {
    id: 'crd-' + "ipaddressclaims.netbox.dev", //TODO: Change to dynamic
    label: 'test',
    icon: <KubeIcon kind="CustomResourceDefinition" />,
    useData() {
      const crs = crd.useList({namespace: useNamespaces()})
      
      return useMemo(() => {
        if (!crs) return null;
  
  
        return {
          nodes: [],
          edges: [],
        };
      }, [crs]);
    }
}

function iterateCRDs() {
  const [crdResource, error] = CRD.useGet(crd);
  const crClass = crdResource.makeCRClass();
  return [createSource(crClass)]
}*/

const createCrSources = (crds: CRD[]): GraphSource[] => {
  const dataClassCrds = crds.map(crd => {
    const crdClass = crd.makeCRClass();
    const data = crdClass.useList({ cluster: crd.cluster, namespace: useNamespaces() });
    return { data, crdClass, crd };
  });

  const queries = dataClassCrds.map(it => it.data);

  //const [isWarningClosed, setIsWarningClosed] = useState(false);

  //const { crInstancesList, getCRDForCR, isLoading, crdsFailedToLoad, allFailed } = useMemo(() => {
  const { crInstancesList } = useMemo(() => {
    const isLoading = queries.some(it => it.isLoading || it.isFetching);

    // Collect the names of CRD that failed to load lists
    const crdsFailedToLoad: string[] = [];
    queries.forEach((it, i) => {
      if (it.isError) {
        crdsFailedToLoad.push(crds[i].metadata.name);
      }
    });

    // Create a map to be able to link to CRD by CR kind
    const crKindToCRDMap = queries.reduce((acc, { items }, index) => {
      if (items?.[0]) {
        acc[items[0].kind] = crds[index];
      }
      return acc;
    }, {} as Record<string, CRD>);
    const getCRDForCR = (cr: KubeObject) => crKindToCRDMap[cr.kind];

    return {
      crInstancesList: queries.flatMap(it => it.items ?? []),
      getCRDForCR,
      isLoading,
      crdsFailedToLoad,
      allFailed: crdsFailedToLoad.length === queries.length,
    };
  }, queries);
  console.log('crInstancesList');
  console.log(crInstancesList);
  const crGraphSource: GraphSource = {
    id: 'cr-', //+ crd.metadata.name,
    label: 'cr', //crd.metadata.name,
    icon: <KubeIcon kind="CustomResourceDefinition" />,
    useData: () => {
      const edges: GraphEdge[] = [];
      return {
        nodes: crInstancesList.map(makeKubeObjectNode) ?? [],
        edges,
      };
    },
  };
  return [crGraphSource];
};

export const crdSource = (crds: CRD[]): GraphSource => ({
  id: 'crs',
  label: 'CRs',
  icon: <Icon icon="mdi:puzzle" width="100%" height="100%" color={getKindGroupColor('other')} />,
  // sources: getCrdSources(),
  sources: [...createCrSources(crds)], //iterateCRDs(),
});
