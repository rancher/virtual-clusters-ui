export type AffinityValue = Record<string, unknown>;

export type ResourceQuantityMap = Record<string, string | number>;

export type K3kPolicyLimit = {
  type?: string;
  max?: ResourceQuantityMap;
  defaultRequest?: ResourceQuantityMap;
};

export type K3kPolicySyncEntry = {
  enabled?: boolean;
} & Record<string, unknown>;

export type K3kPolicySpec = {
  allowedMode?: string;
  defaultNodeSelector?: Record<string, string>;
  sync?: Record<string, K3kPolicySyncEntry>;
  defaultServerAffinity?: AffinityValue;
  defaultAgentAffinity?: AffinityValue;
  limit?: {
    limits?: K3kPolicyLimit[];
  };
  quota?: {
    hard?: Record<string, string | number>;
  };
  podSecurityAdmissionLevel?: string;
  disableNetworkPolicy?: boolean;
} & Record<string, unknown>;

export type K3kPolicy = {
  metadata?: {
    name?: string;
  };
  spec?: K3kPolicySpec;
  setAnnotation?: (keys: string[], value: string) => void; // setAnnotation is defined in resource-class
} & Record<string, unknown>;
