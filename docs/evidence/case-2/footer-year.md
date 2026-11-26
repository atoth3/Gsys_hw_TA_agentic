# Case 2 / step 2.6 — the footer year is the current year, not 2023

Observed 2026-11-26 on https://www.saucedemo.com/inventory.html (logged in as `standard_user`).

Footer text as rendered (see `footer-year.png`):

```
© 2026 Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy
```

The year is not content, it is computed from the browser clock at render time. Excerpt from the
site's only script bundle, `https://www.saucedemo.com/assets/index-DnLqFcJI.js`:

```js
jsxs)(`div`,{className:`footer_copy`,"data-test":`footer-copy`,children:[`© `,new Date().getFullYear(),` Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy`]})
```

The literal `2023` occurs **0 times** in that bundle:

```
$ curl -s https://www.saucedemo.com/assets/index-DnLqFcJI.js | grep -c '2023'
0
```

So the footer showed `2023` only during the calendar year 2023 and can never show it again;
`Terms of Service` is present verbatim (as plain text inside the copyright line, not as a link).
