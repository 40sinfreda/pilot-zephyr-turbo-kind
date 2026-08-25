export const LOOKS = ["night", "bright", "day"] as const;
export type Look = (typeof LOOKS)[number];

export const LOOK_THEME_COLOR: Record<Look, string> = {
  night: "#06151c",
  bright: "#053642",
  day: "#f4f1e6",
};

export function isLook(value: unknown): value is Look {
  return value === "night" || value === "bright" || value === "day";
}

export function applyLook(look: Look) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", look);
  document.documentElement.style.colorScheme = look === "day" ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", LOOK_THEME_COLOR[look]);
}

export const LOOK_BOOT = `(function(){try{if("scrollRestoration" in history)history.scrollRestoration="manual";window.scrollTo(0,0);document.documentElement.classList.add("tide-booting");var r=localStorage.getItem("tideline-place");if(!r)return;var s=JSON.parse(r).state;var l=s&&s.look;if(l==="night"||l==="bright"||l==="day"){document.documentElement.setAttribute("data-theme",l);document.documentElement.style.colorScheme=l==="day"?"light":"dark"}}catch(e){}})();`;
