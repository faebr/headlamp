import { useMemo } from 'react';
import CRD from '../../../../lib/k8s/crd';
import { useNamespaces } from '../../../../redux/filterSlice';
import { GraphSource } from '../../graph/graphModel';
import { KubeIcon } from '../../kubeIcon/KubeIcon';
import { kubeOwnersEdgesReversed, makeKubeObjectNode } from '../GraphSources';

export function crdSource(crds: CRD[]): GraphSource {
  const groupedSources = new Map<string, GraphSource[]>();

  for (const crd of crds) {
    const source = {
      id: 'cr-' + crd.getName(),
      label: crd.spec.names.kind,
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

          return {
            nodes: crInstances.map(makeKubeObjectNode) ?? [],
            edges: crInstances.map(kubeOwnersEdgesReversed).flat() ?? [],
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
      icon: <KubeIcon kind="CustomResourceDefinition" />,
      sources: sources,
    });
  });

  console.log(finalSources);

  return {
    id: 'crs',
    label: 'CRs',
    icon: <KubeIcon kind="CustomResourceDefinition" />,
    sources: finalSources,
  };
}
