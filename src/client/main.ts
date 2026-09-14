const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

// Placeholder until M1 adds the renderer.
const title = document.createElement("h1");
title.textContent = "Bowdle";
title.style.cssText =
  "margin:0;position:absolute;top:40%;width:100%;text-align:center;" +
  "font:64px 'Permanent Marker','Comic Sans MS','Chalkboard SE',cursive;color:#233c9b";
app.append(title);
