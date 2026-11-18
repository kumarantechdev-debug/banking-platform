export const CUSTOMER_HASH_PREFIX = 'search:customer:';
export const CUSTOMER_SEED_IDS_KEY = 'search:customer:seed:ids';
export const CUSTOMER_NAME_INDEX = 'search:index:customer:name';
export const CUSTOMER_MOBILE_INDEX = 'search:index:customer:mobile';
export const CUSTOMER_CITY_INDEX = 'search:index:customer:city';
export const CUSTOMER_STATE_INDEX = 'search:index:customer:state';
export const CUSTOMER_INDEX_KEYS = [
  CUSTOMER_NAME_INDEX,
  CUSTOMER_MOBILE_INDEX,
  CUSTOMER_CITY_INDEX,
  CUSTOMER_STATE_INDEX,
] as const;
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 50;

export const SEARCH_CUSTOMERS_SCRIPT = `
local query = string.lower(ARGV[1])
local limit = tonumber(ARGV[2])
local ids = {}
local seen = {}
local hashPrefix = ARGV[3]
local upperBound = query .. string.char(255)

for _, indexKey in ipairs(KEYS) do
  local members = redis.call('ZRANGEBYLEX', indexKey, '[' .. query, '(' .. upperBound)
  for _, member in ipairs(members) do
    local id = string.match(member, '^[^|]+|(.+)$')
    if id and not seen[id] and redis.call('EXISTS', hashPrefix .. id) == 1 then
      seen[id] = true
      table.insert(ids, id)
    end
  end
end

table.sort(ids)
local result = {#ids}
for i = 1, math.min(#ids, limit) do
  table.insert(result, ids[i])
end
return result
`;

export function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('en');
}
