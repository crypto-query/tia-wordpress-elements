# Live-site fixture

Markup and CSS of three plugins the live site runs and the Docker site does not. The browser pass uses it to show
that the Block's scoped CSS does not leak into this markup, and that this CSS does not leak into the Block.

Seed the page: `bash scripts/wp-seed-fixture.sh` (`clean` removes it). Page: http://localhost:8000/fixture-live-site/.
The page holds `tia-elements/forward-returns`, then one `core/html` block per plugin. Each `.html` file starts with its
`<link>` tags in live enqueue order; the seed replaces `{{base}}` with this directory's URL and `{{wp}}` with the site URL.

Captured from https://tiainvestor.com, logged out.

| Plugin | Version | Markup | Source |
|---|---|---|---|
| LearnDash (`sfwd-lms`) | 5.2.1 | `learndash/course.html` | Body of `/courses/tia-pro-masterclasses/`: infobar and lesson list |
| Presto Player (+ Pro) | 4.5.3 (Pro 3.3.1) | `presto-player/video.html` | Composed from `presto-player/templates/video.php` on the server, filled with live video 219 and preset 2. No public page has a player |
| AffiliateWP | 2.35.2 | `affiliatewp/login-form.html` | `[affiliate_area]` login form of `/affiliate-area/` |

| CSS | Source |
|---|---|
| `learndash/css/*.css` | The `sfwd-lms` stylesheets the course page links, unchanged. `learndash-front-inline.css` is the inline `learndash-front-inline-css` style. `dashicons` (an LD dependency) comes from local core |
| `learndash/fonts/ld-icons.*` | `sfwd-lms/themes/ld30/assets/fonts/`, so `learndash.min.css` resolves `../fonts/` |
| `presto-player/global.css` | `presto-player/src/player/global.css`, which the plugin prints inline |
| `affiliatewp/forms.min.css`, `forms-inline.css` | `affiliate-wp/assets/css/forms.min.css` and the inline `affwp-forms-inline-css` style |

Changes against live:

- Links to tiainvestor.com, the Presto media URLs, the form action and redirect, and the AffiliateWP nonce are replaced with `#` or zeros.
- The LearnDash login modal (closed by default, carries the Discord plugin's button) is left out.
- Presto's player UI lives in a shadow root built by its 12 MB component bundle, which is left out. The light DOM is
  live: `presto-player` stays un-hydrated, so `global.css` keeps it `visibility: hidden` in an aspect-ratio box.
- On live the theme stylesheet sits between these files and `learndash.min.css`. Here all of them load in the body,
  after every head stylesheet, which is the harder case for the Block: they win every specificity tie.
