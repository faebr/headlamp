import { useMemo } from 'react';
import CRD from '../../../../lib/k8s/crd';
import { useNamespaces } from '../../../../redux/filterSlice';
import { GraphEdge, GraphSource } from '../../graph/graphModel';
import { KubeIcon } from '../../kubeIcon/KubeIcon';
import { makeKubeObjectNode } from '../GraphSources';

export function crdSource(crds: CRD[]): GraphSource {
  const sources: GraphSource[] = [];

  for (const crd of crds) {
    sources.push({
      id: 'cr-' + crd.getName(),
      label: crd.getName(),
      icon: <KubeIcon kind="CustomResourceDefinition" />,
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
          const edges: GraphEdge[] = [];
          return {
            nodes: crInstances.map(makeKubeObjectNode) ?? [],
            edges,
          };
        }, [crInstances, error]);
      },
    });
  }

  return {
    id: 'crs',
    label: 'CRs',
    icon: <KubeIcon kind="CustomResourceDefinition" />,
    sources: sources,
  };
}
