# API

A read-only JSON API at `https://somequote.com/api`. It needs no key or sign-in.

| Endpoint | Returns |
| --- | --- |
| `GET /api/quote/today` | Today’s publication |
| `GET /api/quotes/history` | Every publication through today, newest first, one page at a time |

- **Days** are calendar dates (`YYYY-MM-DD`) in New York time. A new quote is published at midnight there.
- **Methods:** only `GET`. Any other method, or any other path under `/api`, answers `404 not_found`.
- **Browsers:** responses carry no CORS headers, so a page on another site can’t read them. Call the API from a server or a script.
- **Rate limit:** 20 requests a minute per IP address (per `/64` for IPv6). Past that, it answers `429 rate_limited` with `Retry-After: 60`.

## Today’s quote

```
GET /api/quote/today
```

```json
{
  "date": "2026-10-23",
  "quote": {
    "category": "general",
    "id": "emerson-enthusiasm",
    "text": "Nothing great was ever achieved without enthusiasm.",
    "author": "Ralph Waldo Emerson",
    "source": "Circles"
  }
}
```

Everyone gets the same quote for the whole day.

## History

```
GET /api/quotes/history?limit=1&before=2026-10-20
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `limit` | `10` | Publications per page, `1` to `30` |
| `before` | tomorrow | Only days before this date. Leave it out, or pass a later date, to start from today. |

Pass each parameter at most once.

```json
{
  "items": [
    {
      "date": "2026-10-19",
      "quote": {
        "category": "bible",
        "id": "web-psalm-23-1",
        "text": "Yahweh is my shepherd; I shall lack nothing.",
        "reference": "Psalm 23:1",
        "translation": "World English Bible"
      }
    }
  ],
  "nextBefore": "2026-10-19"
}
```

To get the next page, send `nextBefore` as `before`. It is `null` on the last page.

## Quotes

A publication is a `date` and a `quote`. `category` decides which attribution fields a quote has:

| Field | `general` | `bible` |
| --- | --- | --- |
| `id` | stable identifier, such as `emerson-enthusiasm` | `web-` and the reference, such as `web-psalm-23-1` |
| `text` | the quote, up to 360 characters; may contain `\n` line breaks | the verse, same limits |
| attribution | `author` and `source` | `reference` and `translation` |

Attribution fields are at most 80 characters.

## Errors

Every error has the same shape and is never cached:

```json
{ "error": { "code": "invalid_request", "message": "Use limit once as 1–3 decimal digits between 1 and 30, and before once as a YYYY-MM-DD date." } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `invalid_request` | A history parameter is malformed, out of range, or repeated |
| 404 | `not_found` | Unknown path, or a method other than `GET` |
| 429 | `rate_limited` | Over the rate limit; retry after `Retry-After` seconds |
| 503 | `no_quote_available` | No quote can be published right now |
| 500 | `internal_error` | Anything else |

## Caching

Successful responses send `Cache-Control: public, max-age=N` and a matching `Expires`. `N` is at most an hour, and never runs past the next midnight in New York, so a cached copy never outlives its day.

## Examples

```bash
curl https://somequote.com/api/quote/today
curl "https://somequote.com/api/quotes/history?limit=5"
curl "https://somequote.com/api/quotes/history?limit=5&before=2026-10-19"
```
