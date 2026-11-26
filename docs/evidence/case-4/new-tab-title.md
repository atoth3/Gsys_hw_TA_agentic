# Evidence D-4.3 — title of the page opened in the new tab (observed 2026-11-26)

Step 4.3 expects the new tab's title to be
`Selenium Live Project: FREE Real Time Project for Practice`.

The image inside the iframe of the demo page links to
`http://www.guru99.com/live-selenium-project.html` (301 → `https://www.guru99.com/live-selenium-project.html`).
That page's title today is **`Selenium Live Project for Practice`** — the `: FREE Real Time Project`
part no longer exists.

## In the browser (Playwright MCP, after clicking the image in the iframe)

```
Open tabs
- 0: [Demo Guru99 Page](https://demo.guru99.com/test/guru99home/)
- 1: [Selenium Live Project for Practice](https://www.guru99.com/live-selenium-project.html)

document.title : "Selenium Live Project for Practice"
<h1>          : "Selenium Live Project for Practice"
location.href : "https://www.guru99.com/live-selenium-project.html"
```

## From the served HTML

```
$ curl -sSL https://www.guru99.com/live-selenium-project.html | grep -i '<title>'
<title>Selenium Live Project for Practice</title>
og:title" content="Selenium Live Project for Practice" /
```

No variant of the string `FREE Real Time Project` occurs anywhere in the served HTML.
