// The only module that calls Google's place APIs (030).
//
// **Two cheap calls, and the field masks are the bill.** A text search asks
// for the place id alone (Text Search Essentials, IDs only, free), then the
// place's details ask for its coordinates and its kind alone (Place Details
// Essentials). Asking for a name or an address would move both calls onto a
// dearer tier, and Google's terms would not let us keep either anyway.
//
// **Only the query goes.** No language, region or location bias derived from
// a person, no cookie, no referrer. The query has already passed
// `placeQuery`, the one gate in front of Google; this module does not decide
// what may be sent, only how.
//
// **Errors are not inspected.** A provider error can quote the request, and
// the request is a place name taken out of what somebody dumped (OFF-1).

const PLACES_HOST = "https://places.googleapis.com";

/** Long enough for a slow provider, short enough that a hung request does not
 *  hold a job runner. */
const TIMEOUT_MS = 8_000;

/** Google's place ids are URL-safe base64 with `_` and `-`; anything else is
 *  not one, and would change the path it is put into. */
const PLACE_ID = /^[A-Za-z0-9_-]{1,512}$/;

async function call(path: string, init: RequestInit, key: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${PLACES_HOST}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Goog-Api-Key": key },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`places ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Google's id for the best match, or null when it found nothing. */
export async function searchId(query: string, key: string): Promise<string | null> {
  const body = (await call(
    "/v1/places:searchText",
    {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-FieldMask": "places.id" },
      // `pageSize` is the current name; the live endpoint was checked on
      // 2026-10-02 to accept it (T0.4).
      body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    },
    key,
  )) as { places?: { id?: string }[] };
  return body.places?.[0]?.id ?? null;
}

/** A place's coordinates and kind, or null. */
export async function details(
  placeId: string,
  key: string,
): Promise<{ lat: number; lng: number; types: string[] } | null> {
  if (!PLACE_ID.test(placeId)) throw new Error("not a place id");
  const body = (await call(
    `/v1/places/${placeId}`,
    { method: "GET", headers: { "X-Goog-FieldMask": "location,types" } },
    key,
  )) as { location?: { latitude?: number; longitude?: number }; types?: string[] };
  const lat = body.location?.latitude;
  const lng = body.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng, types: body.types ?? [] };
}

const COARSE = new Set(["country", "continent", "administrative_area_level_1", "administrative_area_level_2"]);

const AREA = /^(locality|sublocality.*|neighborhood|postal_code.*|administrative_area_level_[3-7]|colloquial_area)$/;

/** What a result is, by its categories: too coarse to draw (a country, a
 *  region), an area drawn as a circle (a neighbourhood, a town, a postcode),
 *  or a spot drawn as a point (an establishment, a landmark, an address). */
export function kindOf(types: readonly string[]): "coarse" | "area" | "spot" {
  if (types.some((t) => COARSE.has(t))) return "coarse";
  if (types.some((t) => AREA.test(t))) return "area";
  if (types.length > 0 && types.every((t) => t === "political")) return "area";
  return "spot";
}
