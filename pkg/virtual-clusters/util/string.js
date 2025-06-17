/**
 * Parse k3k cluster environment variables into an object to  use with KeyValue.vue
 * @param envArray - array of environment variables in the format --<key>=<value>
 * @returns  object whose keys  are environment variable keys, with leading dashes stripped
 * ["--var-one=value1", "--var-two=value2"] --> {var-one: value1, var-two:value2}
 */
export function parseEnvVars(envArray) {
  const out = {};

  envArray.forEach((v) => {
    // splitting on the  leading -- will result in an empty string in the array
    const [key, val] = v.split(/=|--/g).filter((string) => !!string);

    out[key] = val;
  });

  return out;
}

/**
 * Format  KeyValue.vue output into k3k cluster environment variables
 * @param envObject object whose keys  are environment variable keys, with leading dashes stripped
 * @returns - array of environment variables in the format --<key>=<value>
 * {var-one: value1, var-two:value2} --> ["--var-one=value1", "--var-two=value2"]
 */
export function formatEnvVars(envObject) {
  const out = [];

  Object.keys(envObject).forEach((key) => {
    out.push(`--${ key }=${ envObject[key] }`);
  });

  return out;
}
