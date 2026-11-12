
import semver from 'semver';
import pkgjson from '../package.json';

// these need to be defined in a file without @shell imports so they can be used in cypress commands
export const K3K_CHART_NAME = 'suse-virtual-cluster-engine';
export const K3K_CHART_NAMESPACE = 'k3k-system';
export const K3K_REPO_NAME = 'suse-virtual-cluster-engine';
export const K3K_REPO_URL = 'oci://registry.suse.com/rancher/charts/appco-suse-virtual-cluster-engine';

export const K3K_VALUES = {
  server: {
    image: {
      registry:   'registry.rancher.com',
      repository: 'rancher/k3s'
    }
  },
  agent: {
    shared: {
      image: {
        registry:   'registry.suse.com',
        repository: 'rancher/appco-k3k-kubelet'
      }
    },
    virtual: {
      image: {
        registry:   'registry.rancher.com',
        repository: 'rancher/k3s'
      }
    }
  },
  controller: {
    image: {
      registry:   'registry.suse.com',
      repository: 'rancher/appco-k3k'
    }
  }
};

const { major, minor } = semver.coerce(pkgjson.version);

// virtual clusters ui and k3k sync major/minor releases
// so the ui version can be used to determine max supported k3k version

export const K3K_MAX_VERSION = `${ major }.${ minor }.x`;

/**
 * Every chart entry in the k3k repo index, whatever its index key.
 * older k3k tags (<1.2.0) are indexed under the last segment of the oci repository path
 * @param {object} index the ClusterRepo `index` link
 * @returns object[] - index entries, each with `name` and `version`
 */
export const k3kIndexCharts = (index) => Object.values(index?.entries || {}).flat();

/**
 * Pick the chart to install
 * @param {object[]} charts entries from k3kIndexCharts
 * @param {string} [version] (optional, only used in e2e) exact version to pick: defaults to the highest stable version at or below K3K_MAX_VERSION
 * @returns object | null - the index entry: its `name` is the chartName for the install action; null if no entry matches
 */
export const k3kChartToInstall = (charts, version) => {
  const target = version || semver.maxSatisfying(charts.map((chart) => chart.version), `<=${ K3K_MAX_VERSION }`);
  const matches = charts.filter((chart) => chart.version === target);

  return matches.find((chart) => chart.name === K3K_CHART_NAME) || matches[0] || null;
};

/**
 * Why k3kChartToInstall(charts) returned null
 * 'tooHigh': every valid version is above K3K_MAX_VERSION, ie the extension is too old for the repo
 * the other values are keys under k3k.errors
 * semver.gtr is not used: it counts a prerelease of a supported minor (eg 1.3.1-rc1) as above the range
 * @param {object[]} charts entries from k3kIndexCharts
 * @returns 'noK3kCharts' | 'noValidK3kVersions' | 'tooHigh' | 'onlyPrereleaseK3kVersions'
 */
export const k3kNoChartReason = (charts) => {
  const versions = charts.map((chart) => chart.version).filter((version) => semver.valid(version));

  if (!charts.length) {
    return 'noK3kCharts';
  }

  if (!versions.length) {
    return 'noValidK3kVersions';
  }

  if (versions.every((version) => !semver.satisfies(version, `<=${ K3K_MAX_VERSION }`, { includePrerelease: true }))) {
    return 'tooHigh';
  }

  return 'onlyPrereleaseK3kVersions';
};
