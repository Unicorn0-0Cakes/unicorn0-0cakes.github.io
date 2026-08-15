// Inject Header & Footer when the DOM is fully loaded

// Where this archived copy is mounted. Worked out from this script's own
// URL, so the snapshot's internal navigation survives the site moving host
// or sitting on a project subpath. Its pages were relocated under
// /archive/ during the rebuild, so old root links are remapped here.
var ARCHIVE = (function () {
  var s = document.currentScript;
  var src = s && s.src ? s.src : null;
  if (!src) {
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf("legacy-header-footer.js") !== -1) {
        src = all[i].src;
        break;
      }
    }
  }
  if (!src) return "/archive/";
  try { return new URL("./", src).pathname; } catch (e) { return "/archive/"; }
})();
var SITE = ARCHIVE.replace(/archive\/$/, "");
document.addEventListener("DOMContentLoaded", function () {
    // Header HTML
    const headerHTML = `
  <!-- HEADER -->
  <header>
    <div class="container">
      <div class="header-brand">
        <h1>
          <a href="${SITE}" class="static-link">Candice Cantrelle</a>
        </h1>
        <p>Signature visual solutions for fine &amp; estate jewelry houses</p>
      </div>
      <nav>
        <ul>
          <li><a href="${ARCHIVE}jewelry/">Jewelry</a></li>
          <li><a href="${ARCHIVE}real-estate/">Real Estate (Select)</a></li>
          <li><a href="${ARCHIVE}portfolio.html">Portfolio</a></li>
          <li><a href="${ARCHIVE}work-with-me.html">Work with Me</a></li>
          <li><a href="https://candice-cantrelle.breely.com/form/10405">Consultation</a></li>
        </ul>
      </nav>
    </div>
  </header>

    `;

    // Footer HTML
    const footerHTML = `
        <footer>
            
    <!-- CONTACT -->
    <section id="contact" class="section contact">
      <div class="container">
        <h2>Contact &amp; Private Consultation</h2>
        <p>
          Discretion and excellence are at the heart of every partnership. Schedule a private conversation to explore how signature visual artistry can elevate your brand.
        </p>
        <p>
          For inquiries or to book a confidential consult, request a time below or email
          <a href="mailto:hello@candicecantrelle.com">hello@candicecantrelle.com</a>.
        </p>
        <a class="cta-btn" href="https://candice-cantrelle.breely.com/form/10405">
          Request Consultation
        </a>

        <div class="social-links">
          <span>Connect: </span>
          <a href="https://linkedin.com/in/candicecantrelle">LinkedIn</a> |
          <a href="https://github.com/Unicorn0-0Cakes">GitHub</a>
        </div>
      </div>
    </section>


    <div class="container">
      <div class="footer-content">
        <div class="footer-brand">
          <h3>Candice Cantrelle</h3>
          <p>
            Signature visual systems for fine, estate, and antique jewelry houses, with select collaborations in adjacent luxury fields.
          </p>
        </div>
        <div class="footer-links">
          <div class="footer-column">
            <h4>Studio</h4>
            <ul>
              <li><a href="${ARCHIVE}portfolio.html">Portfolio</a></li>
              <li><a href="${ARCHIVE}work-with-me.html">Work with Me</a></li>
            </ul>
          </div>
          <div class="footer-column">
            <h4>Specializations</h4>
            <ul>
              <li><a href="${ARCHIVE}jewelry/">Jewelry</a></li>
              <li><a href="${ARCHIVE}real-estate/">Real Estate</a></li>
            </ul>
          </div>
          <div class="footer-column">
            <h4>Connect</h4>
            <ul>
              <li><a href="mailto:hello@candicecantrelle.com">Email</a></li>
              <li><a href="https://linkedin.com/in/candicecantrelle">LinkedIn</a></li>
              <li><a href="https://github.com/Unicorn0-0Cakes">GitHub</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; <span id="year"></span> Candice Cantrelle. All rights reserved.</p>
        <p class="footer-tagline">Refined visual systems for discerning jewelry brands.</p>
      </div>
    </div>
    <script>
      document.getElementById('year').textContent = new Date().getFullYear();
    </script>

        </footer>
        `;
            

         // Insert header at the top of the body
         document.body.insertAdjacentHTML("afterbegin", headerHTML);

         // Insert footer at the end of the body
         document.body.insertAdjacentHTML("beforeend", footerHTML);
    });
