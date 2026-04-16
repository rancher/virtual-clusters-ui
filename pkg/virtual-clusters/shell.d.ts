declare module '@shell/store/plugins'{
    export function mapDriver(name: string, to: string): void
};
declare module '@shell/config/version'{
    export function getVersionData(): {Version: string, RancherPrime: string, GitCommit: string}
    export const CURRENT_RANCHER_VERSION: string;
};
declare module '@shell/config/query-params'{
    export const _DETAIL: string;
};

declare module '@shell/components/form/NodeAffinity' {
    const component: any;
    export default component;
};

declare module '@shell/components/form/PodAffinity' {
    const component: any;
    export default component;
};

declare module '*.js' {
    const value: any;
    export default value;
};