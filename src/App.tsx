import { useEffect, useState } from "react";
import { Capture } from "./components/Capture";
import { CompanyPage } from "./components/CompanyPage";
import { Musings } from "./components/Musings";
import { Pipeline } from "./components/Pipeline";
import { onToast } from "./toast";

type Route =
  | { name: "capture" }
  | { name: "pipeline" }
  | { name: "company"; id: number }
  | { name: "musings" };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("/pipeline")) return { name: "pipeline" };
  if (hash.startsWith("/musings")) return { name: "musings" };
  const company = hash.match(/^\/company\/(\d+)/);
  if (company) return { name: "company", id: Number(company[1]) };
  return { name: "capture" };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = onToast((msg) => {
      setToastMsg(msg);
      clearTimeout(timer);
      timer = setTimeout(() => setToastMsg(null), 2600);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <main>
        {route.name === "capture" && <Capture />}
        {route.name === "pipeline" && <Pipeline />}
        {route.name === "company" && (
          <CompanyPage key={route.id} id={route.id} />
        )}
        {route.name === "musings" && <Musings />}
      </main>
      <nav className="tabbar">
        <Tab href="#/" label="Capture" icon="✎" active={route.name === "capture"} />
        <Tab
          href="#/pipeline"
          label="Pipeline"
          icon="▤"
          active={route.name === "pipeline" || route.name === "company"}
        />
        <Tab
          href="#/musings"
          label="Musings"
          icon="∿"
          active={route.name === "musings"}
        />
      </nav>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}

function Tab(props: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <a href={props.href} className={props.active ? "active" : ""}>
      <span className="icon">{props.icon}</span>
      {props.label}
    </a>
  );
}
