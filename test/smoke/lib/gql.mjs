/**
 * @param {string} url
 * @param {string} query
 * @param {Record<string, unknown>} [variables]
 */
export async function gql(url, query, variables) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

/**
 * @param {string} url
 * @param {string} query
 * @param {string} listField
 * @param {Record<string, unknown>} [baseVariables]
 * @param {number} pageSize
 */
export async function paginateGql(url, query, listField, baseVariables = {}, pageSize = 100) {
  /** @type {unknown[]} */
  const items = [];
  let after = null;
  while (true) {
    const data = await gql(url, query, { ...baseVariables, limit: pageSize, after });
    const page = data[listField];
    const pageItems = page?.items ?? [];
    items.push(...pageItems);
    if (!page?.pageInfo?.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return items;
}
