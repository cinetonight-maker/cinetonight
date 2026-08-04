import Link from "next/link";
import Icon from "./Icon";

const SOCIAL: [string, string][] = [["fb", "#1877f2"], ["tw", "#1da1f2"], ["ig", "#e1306c"], ["tg", "#0088cc"], ["yt", "#ff0000"]];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__in">
        <div className="footer__brand">
          <div className="brand__name">MOVIE<b style={{ color: "var(--purple2)" }}>X</b></div>
          <p>Your Entertainment Hub. Watch the latest movies and web series in HD quality.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link href="/">Home</Link><Link href="/movies">Movies</Link><Link href="/web-series">Web Series</Link>
          <Link href="/blog">Blog</Link><Link href="/pricing">Pricing</Link>
        </div>
        <div>
          <h4>Support</h4>
          <Link href="/signin">Sign In</Link><a href="#">Help Center</a><a href="#">Contact Us</a><a href="#">DMCA</a>
        </div>
        <div>
          <h4>Legal</h4>
          <a href="#">Terms of Service</a><a href="#">Privacy Policy</a><a href="#">Refund Policy</a>
        </div>
        <div>
          <h4>Connect With Us</h4>
          <div className="social">
            {SOCIAL.map(([n, bg]) => <a key={n} href="#" style={{ background: bg }} aria-label={n}><Icon name={n} size={16} /></a>)}
          </div>
        </div>
      </div>
      <div className="footer__copy">
        © 2024 MOVIEX. All rights reserved. · Demo project.
        <br />
        <span className="tmdb-attr">
          Movie &amp; TV data provided by{" "}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>.
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </span>
      </div>
    </footer>
  );
}
