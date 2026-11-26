# Homework (typescript)

<!--
Transcribed verbatim from the Genesys PDF "Homework_TypeScript.pdf" (2 pages).
Only additions: the stable step IDs in **bold** (N.k), the "## Case N" headings that the
orchestrator splits on, and requirement X1, which is ours and not in the PDF (marked as such).
Agents treat this file as READ-ONLY. The orchestrator hands out one "## Case N" section at a time.
-->

## Case 0 – Preconditions

Preconditions:

- **0.1** Nodejs: 18 or newer
- **0.2** Playwright: 1.39.0
- **0.3** Create test runner script in package.json

_Added by us, not in the PDF:_

- **X1** The tests run in CI on GitHub Actions: every pull request to `main` and every push to `main` runs the full suite on a clean runner, using the test runner script from 0.3.

## Case 1 – Automate Purchase Process

- **1.1** Open the url: https://www.saucedemo.com/inventory.html
- **1.2** Create a credential.json file in test/resources folder and store:

  ```
  {
  username: performance_glitch_user,
  password: secret_sauce
  }
  ```

- **1.3** Parse the credentials from credential.json and use it for the following test
- **1.4** On the website type username and password and click on login button
- **1.5** Add the following items to the cart: Sauce Labs Backpack, Sauce Labs Fleece Jacket
- **1.6** Validate the number on the cart symbol
- **1.7** Go through the checkout process
- **1.8** Validate that Thank you for your order message is appearing

## Case 2 – Verify error messages for mandatory fields

- **2.1** Open the url: https://www.saucedemo.com/inventory.html
- **2.2** Click on login button
- **2.3** Validate the error message
- **2.4** Login with the following credentials: standard_user / secret_sauce
- **2.5** Scroll down to the bottom of the page
- **2.6** Validate the footer message contains 2023 and Terms of Service

## Case 3 – Rich Text Editor

- **3.1** Open the url: https://onlinehtmleditor.dev
- **3.2** Type the following text to the editor: Automation Test Example
- **3.3** Automation text should be typed bold format
- **3.4** Test text should be typed underline format
- **3.5** Validate the text is appearing in the rich text editor

## Case 4 – iFrame and tab handling

- **4.1** Open this url http://demo.guru99.com/test/guru99home
- **4.2** Locate the image inside the iframe near bottom of the page just above Email Submission and click on it
- **4.3** Verify new page is loaded in new tab with title: Selenium Live Project: FREE Real Time Project for Practice
- **4.4** Close this tab and switch back to main window
- **4.5** From top menu click on Selenium link that can be seen while hovering on Testing menu item
- **4.6** Verify the wide red Join Now button is displayed near bottom of the page

## Case 5 – REST API testing

- **5.1** Add Rest Api library for the test project
- **5.2** Create and send request:

  ```
  Request type: GET
  Host: https://jsonplaceholder.typicode.com
  Endpoint: /users
  ```

- **5.3** Parse response to Json format
- **5.4** Log only the names and emails from the response data

  Example:

  ```
  Leanne Graham | Sincere@april.biz
  Ervin Howell | Shanna@melissa.tv
  ```

- **5.5** Verify the first email address contains @

## Closing note (not a case)

Don't forget to upload your code to GitHub!

_Handled by the orchestrator's publish + merge step (`--merge`), not by an agent._
