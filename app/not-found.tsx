import Link from "next/link";
import Icon from "@/components/Icon";
export default function NotFound() {
  return (
    <div className="page">
      <div className="nf">
        <h1>404</h1>
        <p>That page went off-script.</p>
        <Link className="btn btn--play" href="/"><Icon name="home" size={16} /> Back Home</Link>
      </div>
    </div>
  );
}
