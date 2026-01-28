# xbars

## To configure

Create a GitHub Personal Access Token that has access to the repos
you care to show in your menu bar.
Put it into a file called `~/.xbar-github.json` along with your username.
It should look like this:

```json
{ "token": "ghp_6BtFad8kFfKWTQgw0000000000000000000000", "username": "peterbe" }
```

## To build

```bash
just build
```

### To build and run

```bash
just run
```

### To ship

```bash
just ship
```

See the [justfile](./justfile) source for tips.

## To debug

```bash
just dev
```

this will re-run the main script every time a file is saved.

You can open `/tmp/xbar-prs.json` in your editor so that on the next run,
even though nothing has actually changed on GitHub, it'll think something has changed
and this can make it easier to dev on the alerts.

## About GitHub API rate limiting

According to
<https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#rate-limit>
the rate limit is:

> The REST API has a custom rate limit for searching. For authenticated requests,
> you can make up to 30 requests per minute for all search endpoints
