# Evidence D-4.6 — no "Join Now" button on the Selenium page (observed 2026-11-26)

Step 4.5 leads to `https://www.guru99.com/selenium-tutorial.html` (the only link labelled
`Selenium` in the Testing drop-down of the demo page's top menu). Step 4.6 expects a *wide red
Join Now button near the bottom of the page*. That element does not exist there any more.

## The string is absent from the served HTML

```
$ curl -sSL https://www.guru99.com/selenium-tutorial.html | grep -ic 'join[ _-]*now'
0
```

## …and from the rendered page

Rendered in the Playwright MCP browser, scrolled through the whole document so lazy content loads
(document height 5599 px on load, 6598 px after scrolling):

```
/join\s*now/i.test(document.body.innerText)  ->  false
the only occurrence of "join" in the page text:
  "Learn Selenium in 7 Days! | Join our FREE Course | Submit"
```

That `Join our FREE Course` block is injected by a third-party script (it is not in the served
HTML) and sits mid-page at y ≈ 2340 of 6598, not near the bottom.

## What is near the bottom today

The last call-to-action of the page is the newsletter block
`Sign up for the newsletter | Subscribe for Free | Chosen by over 350,000+ professionals`:

```
button#submitBtn  text "Subscribe for Free"
  y 5753 of document height 5599 on load (last block before the footer link lists)
  270 x 52 px, background rgb(255, 193, 7)
  present in the served HTML (<form id="makeForm"> … <button id="submitBtn">), single occurrence
```

No element on the page is both red and wide near the bottom; the only red control there is the
85 px `Next →` post-navigation link.

Screenshot of that region: [`selenium-page-bottom-no-join-now.png`](selenium-page-bottom-no-join-now.png)
