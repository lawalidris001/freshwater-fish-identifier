/* ==========================================================
   FinID - Freshwater Fish Identifier
   Runs the trained ONNX model in the browser (ONNX Runtime Web).

   Model contract (from the Colab notebook):
   - input  "input": float32 [1, 3, 224, 224], RGB, values 0 to 1
                     (the image is stretched to 224 x 224, no crop)
   - output "probs": float32 [1, 6] probabilities (softmax inside the model)
   - class order: niloticus, aureus, melanotheron, zillii, gariepinus, carpio
   ========================================================== */
(() => {
  "use strict";

  /* ---------- Settings ---------- */
  const CONFIG = {
    modelUrl: "model/tilapia.onnx",
    labelsUrl: "model/labels.json",
    ortPath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/",
    size: 224,
    maxBytes: 10 * 1024 * 1024,
    allowed: ["image/jpeg", "image/png", "image/webp"],
    // Same order the notebook used for CLASSES (list(SPECIES)).
    // It is replaced by model/labels.json automatically when that file exists.
    classes: ["niloticus", "aureus", "melanotheron", "zillii", "gariepinus", "carpio"],
    high: 0.75,
    medium: 0.5,
  };

  /* ---------- Species information ---------- */
  const SPECIES = {
    niloticus: {
      slug: "nile-tilapia",
      name: "Nile tilapia",
      sci: "Oreochromis niloticus",
      family: "Cichlidae",
      blurb: "The most widely farmed tilapia in the world and a staple of African aquaculture.",
      tells: [
        "Regular vertical stripes running down the tail fin",
        "Grey to olive body with a pale belly",
        "Long dorsal fin with a smooth, continuous base",
        "Breeding males flush pink or red around the head and fin edges",
      ],
      habitat: "Rivers, lakes and fish ponds across tropical Africa",
      confused: "Blue tilapia and redbelly tilapia",
    },
    aureus: {
      slug: "blue-tilapia",
      name: "Blue tilapia",
      sci: "Oreochromis aureus",
      family: "Cichlidae",
      blurb: "A close relative of the Nile tilapia, tougher in cooler water, with a bluish sheen.",
      tells: [
        "Blue-grey body, often with a pinkish head in breeding fish",
        "Tail fin has no strong vertical stripes",
        "Red or pink margin on the dorsal and tail fins when breeding",
        "Tolerates cooler water better than most tilapia",
      ],
      habitat: "Rivers, lakes and warm freshwater ponds",
      confused: "Nile tilapia",
    },
    melanotheron: {
      slug: "blackchin-tilapia",
      name: "Blackchin tilapia",
      sci: "Sarotherodon melanotheron",
      family: "Cichlidae",
      blurb: "A salt-tolerant tilapia of West African lagoons and estuaries, named for its dark throat.",
      tells: [
        "Dark patch under the chin and throat",
        "Olive body often dotted with pale yellow flecks",
        "Found in brackish lagoons as well as fresh water",
        "Males carry the eggs in their mouth",
      ],
      habitat: "Lagoons, estuaries and coastal rivers of West Africa",
      confused: "Nile tilapia",
    },
    zillii: {
      slug: "redbelly-tilapia",
      name: "Redbelly tilapia",
      sci: "Coptodon zillii",
      family: "Cichlidae",
      blurb: "Also called Zill's tilapia. A plant-eating species with bold bars and an orange belly.",
      tells: [
        "Five to seven dark vertical bars along the flanks",
        "Olive-yellow body with an orange to red belly",
        "Deep, rounded body shape",
        "Often found among aquatic plants and reeds",
      ],
      habitat: "Vegetated lakes, rivers, canals and ponds",
      confused: "Nile tilapia and blackchin tilapia",
    },
    gariepinus: {
      slug: "african-catfish",
      name: "African catfish",
      sci: "Clarias gariepinus",
      family: "Clariidae",
      blurb: "A hardy, air-breathing catfish and one of the most important farmed fish in Nigeria.",
      tells: [
        "Long, eel-like body with no scales",
        "Four pairs of whisker-like barbels around the mouth",
        "Flat, bony head and a very long dorsal fin",
        "Dark grey to olive back with a paler belly",
      ],
      habitat: "Rivers, swamps, floodplains and ponds, even low-oxygen water",
      confused: "Other catfish species",
    },
    carpio: {
      slug: "common-carp",
      name: "Common carp",
      sci: "Cyprinus carpio",
      family: "Cyprinidae",
      blurb: "A large, long-lived fish farmed and fished across the world, originally from Eurasia.",
      tells: [
        "Two pairs of barbels beside the mouth",
        "One long dorsal fin with a stiff, serrated spine",
        "Large scales on a golden to bronze body",
        "Forked tail and a mouth that points downward",
      ],
      habitat: "Slow rivers, lakes and ponds with soft, muddy bottoms",
      confused: "Tilapia, from a distance",
    },
  };

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const info = (key) => SPECIES[key] || { slug: "", name: key, sci: "", family: "", blurb: "", tells: [], habitat: "", confused: "" };

  // Show a real photo if images/<slug>.jpg exists, otherwise fall back to the illustration.
  function setFishImage(img, key) {
    const slug = info(key).slug;
    if (!slug) return;
    img.onerror = () => { img.onerror = null; img.src = `images/${slug}.svg`; };
    img.src = `images/${slug}.jpg`;
  }

  const pct = (v) => `${(v * 100).toFixed(v >= 0.995 || v < 0.1 ? 1 : 0)}%`;

  /* ---------- Elements ---------- */
  const el = {
    header: $("siteHeader"), navToggle: $("navToggle"), nav: $("siteNav"),
    dropZone: $("dropZone"), fileInput: $("fileInput"), cameraInput: $("cameraInput"),
    chooseBtn: $("chooseBtn"), cameraBtn: $("cameraBtn"),
    previewWrap: $("previewWrap"), previewImg: $("previewImg"), scanning: $("scanning"),
    fileName: $("fileName"), fileMeta: $("fileMeta"),
    againBtn: $("againBtn"), removeBtn: $("removeBtn"), uploadMsg: $("uploadMsg"),
    status: $("modelStatus"), statusText: $("modelStatusText"),
    resEmpty: $("resultEmpty"), resLoading: $("resultLoading"), resError: $("resultError"), resBody: $("resultBody"),
    loadingText: $("loadingText"), errorTitle: $("errorTitle"), errorText: $("errorText"), errorRetry: $("errorRetry"),
    topImg: $("topImg"), topName: $("topName"), topSci: $("topSci"), topConf: $("topConf"), topConfLabel: $("topConfLabel"),
    topMeter: $("topMeter"), topNote: $("topNote"), probList: $("probList"), topTells: $("topTells"), moreBtn: $("moreBtn"),
    grid: $("speciesGrid"), dialog: $("speciesDialog"), dlgClose: $("dlgClose"),
  };

  let currentFile = null;
  let lastTopKey = null;
  let busy = false;

  /* ==========================================================
     Navigation and page chrome
     ========================================================== */
  el.navToggle.addEventListener("click", () => {
    const open = el.nav.classList.toggle("open");
    el.navToggle.setAttribute("aria-expanded", String(open));
    el.navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  el.nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      el.nav.classList.remove("open");
      el.navToggle.setAttribute("aria-expanded", "false");
    }
  });
  window.addEventListener("scroll", () => el.header.classList.toggle("scrolled", window.scrollY > 8), { passive: true });
  $("year").textContent = new Date().getFullYear();

  /* ==========================================================
     Species guide and dialog
     ========================================================== */
  function buildSpeciesGrid() {
    el.grid.innerHTML = "";
    CONFIG.classes.forEach((key) => {
      const s = info(key);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "sp-card";
      card.setAttribute("aria-label", `Open profile of ${s.name}`);
      card.innerHTML = `
        <img alt="${s.name}" width="640" height="380" loading="lazy">
        <div class="sp-body">
          <span class="family">Family ${s.family}</span>
          <h3>${s.name}</h3>
          <span class="sci">${s.sci}</span>
          <p class="blurb">${s.blurb}</p>
          <span class="sp-more">View profile</span>
        </div>`;
      setFishImage(card.querySelector("img"), key);
      card.addEventListener("click", () => openProfile(key));
      el.grid.appendChild(card);
    });
  }

  function openProfile(key) {
    const s = info(key);
    setFishImage($("dlgImg"), key);
    $("dlgImg").alt = s.name;
    $("dlgFamily").textContent = `Family ${s.family}`;
    $("dlgName").textContent = s.name;
    $("dlgSci").textContent = s.sci;
    $("dlgBlurb").textContent = s.blurb;
    $("dlgHabitat").textContent = s.habitat;
    $("dlgConfused").textContent = s.confused;
    $("dlgTells").innerHTML = s.tells.map((t) => `<li>${t}</li>`).join("");
    if (typeof el.dialog.showModal === "function") el.dialog.showModal();
    else el.dialog.setAttribute("open", "");
  }

  el.dlgClose.addEventListener("click", () => el.dialog.close());
  el.dialog.addEventListener("click", (e) => { if (e.target === el.dialog) el.dialog.close(); });

  /* ==========================================================
     Model loading
     ========================================================== */
  let sessionPromise = null;

  function setStatus(state, text) {
    el.status.dataset.state = state;
    el.statusText.textContent = text;
  }

  function loadModel() {
    if (sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
      if (typeof ort === "undefined") {
        throw new Error("The ONNX Runtime library could not be loaded. Check your internet connection and reload the page.");
      }
      ort.env.wasm.wasmPaths = CONFIG.ortPath;
      ort.env.wasm.numThreads = 1; // works on GitHub Pages without special headers

      const session = await ort.InferenceSession.create(CONFIG.modelUrl, { executionProviders: ["wasm"] });
      return session;
    })();

    sessionPromise.then(
      () => setStatus("ready", "Model ready"),
      (err) => {
        console.error("Model load failed:", err);
        setStatus("error", "Model not loaded");
        sessionPromise = null; // allow a retry
      }
    );
    return sessionPromise;
  }

  async function loadLabels() {
    try {
      const res = await fetch(CONFIG.labelsUrl, { cache: "no-cache" });
      if (!res.ok) return;
      const labels = await res.json();
      if (Array.isArray(labels.classes) && labels.classes.length) CONFIG.classes = labels.classes;

      if (labels.backbone) $("factBackbone").textContent = labels.backbone.replace(/_100$/, "").replace("mobilenetv2", "MobileNetV2");
      if (labels.input_size) $("factInput").textContent = `${labels.input_size} × ${labels.input_size} px`;
      if (labels.n_images) { $("factImages").textContent = Number(labels.n_images).toLocaleString(); $("factImagesRow").classList.remove("hidden"); }
      if (labels.test_metrics && typeof labels.test_metrics.accuracy === "number") {
        $("factAcc").textContent = `${(labels.test_metrics.accuracy * 100).toFixed(1)}%`;
        $("factAccRow").classList.remove("hidden");
      }
    } catch (_) { /* labels.json is optional */ }
  }

  /* ==========================================================
     Image handling
     ========================================================== */
  const formatSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(2)} MB`);

  function showMessage(text, isError = false) {
    el.uploadMsg.textContent = text;
    el.uploadMsg.classList.toggle("error", isError);
  }

  function showState(name) {
    el.resEmpty.classList.toggle("hidden", name !== "empty");
    el.resLoading.classList.toggle("hidden", name !== "loading");
    el.resError.classList.toggle("hidden", name !== "error");
    el.resBody.classList.toggle("hidden", name !== "result");
  }

  function showError(title, text) {
    el.errorTitle.textContent = title;
    el.errorText.textContent = text;
    showState("error");
  }

  function acceptFile(file) {
    if (!file) return;
    if (!CONFIG.allowed.includes(file.type)) {
      showMessage("That file type is not supported. Please choose a JPG, PNG or WEBP image.", true);
      return;
    }
    if (file.size > CONFIG.maxBytes) {
      showMessage("That image is larger than 10 MB. Please choose a smaller one.", true);
      return;
    }

    if (el.previewImg.src.startsWith("blob:")) URL.revokeObjectURL(el.previewImg.src);
    currentFile = file;

    el.previewImg.src = URL.createObjectURL(file);
    el.previewImg.alt = `Photo of a fish: ${file.name}`;
    el.fileName.textContent = file.name;
    el.fileMeta.textContent = formatSize(file.size);

    el.dropZone.classList.add("hidden");
    el.previewWrap.classList.remove("hidden");
    showMessage("");

    identify();
  }

  function clearImage() {
    if (el.previewImg.src.startsWith("blob:")) URL.revokeObjectURL(el.previewImg.src);
    currentFile = null;
    el.previewImg.removeAttribute("src");
    el.fileInput.value = "";
    el.cameraInput.value = "";
    el.previewWrap.classList.add("hidden");
    el.dropZone.classList.remove("hidden");
    el.scanning.classList.add("hidden");
    showMessage("");
    showState("empty");
  }

  // Turns a File into the tensor the model expects: [1, 3, 224, 224], RGB, 0 to 1.
  async function fileToTensor(file) {
    const size = CONFIG.size;
    let source;

    try {
      source = await createImageBitmap(file); // respects the photo's EXIF rotation
    } catch (_) {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("This image could not be read."));
        img.src = URL.createObjectURL(file);
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, size, size); // whole fish, no crop (same as training)
    if (source.close) source.close();

    const { data } = ctx.getImageData(0, 0, size, size);
    const plane = size * size;
    const out = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      out[i] = data[i * 4] / 255;             // R
      out[plane + i] = data[i * 4 + 1] / 255; // G
      out[2 * plane + i] = data[i * 4 + 2] / 255; // B
    }
    return new ort.Tensor("float32", out, [1, 3, size, size]);
  }

  function softmaxIfNeeded(values) {
    const arr = Array.from(values);
    const sum = arr.reduce((a, b) => a + b, 0);
    if (arr.every((v) => v >= 0 && v <= 1) && Math.abs(sum - 1) < 0.01) return arr;
    const max = Math.max(...arr);
    const exps = arr.map((v) => Math.exp(v - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((v) => v / total);
  }

  /* ==========================================================
     Identify
     ========================================================== */
  async function identify() {
    if (!currentFile || busy) return;
    busy = true;

    showState("loading");
    el.scanning.classList.remove("hidden");
    el.loadingText.textContent = sessionPromise ? "Looking at your fish" : "Loading the model";

    const started = performance.now();

    try {
      const session = await loadModel();
      el.loadingText.textContent = "Looking at your fish";

      const tensor = await fileToTensor(currentFile);
      const feeds = { [session.inputNames[0]]: tensor };
      const results = await session.run(feeds);
      const raw = results[session.outputNames[0]].data;
      const probs = softmaxIfNeeded(raw);

      // Keep the scanning animation visible for a moment so the result does not flash.
      const elapsed = performance.now() - started;
      if (elapsed < 700) await new Promise((r) => setTimeout(r, 700 - elapsed));

      renderResult(probs);
    } catch (err) {
      console.error(err);
      const notFound = /fetch|404|load|network|Failed/i.test(String(err && err.message));
      showError(
        notFound ? "The model could not be loaded" : "This photo could not be analysed",
        notFound
          ? "Make sure model/tilapia.onnx is in the project folder and that the page is opened through a web server (for example VS Code Live Server or GitHub Pages), not by double-clicking index.html."
          : "Try a different photo, or check that the image is a valid JPG, PNG or WEBP file."
      );
    } finally {
      el.scanning.classList.add("hidden");
      busy = false;
    }
  }

  function renderResult(probs) {
    const classes = CONFIG.classes;
    const ranked = probs
      .map((p, i) => ({ p, key: classes[i] || `class ${i}` }))
      .sort((a, b) => b.p - a.p);

    const top = ranked[0];
    const s = info(top.key);
    lastTopKey = top.key;

    setFishImage(el.topImg, top.key);
    el.topImg.alt = s.name;
    el.topName.textContent = s.name;
    el.topSci.textContent = s.sci;
    el.topConf.textContent = pct(top.p);

    let label = "High confidence", cls = "", note;
    if (top.p >= CONFIG.high) {
      note = `The model is quite sure this is a ${s.name.toLowerCase()}. Compare it with the features below to double-check.`;
    } else if (top.p >= CONFIG.medium) {
      label = "Moderate confidence"; cls = "mid";
      note = `This looks most like a ${s.name.toLowerCase()}, but ${ranked[1] ? info(ranked[1].key).name.toLowerCase() : "another species"} is also possible. A clearer side-on photo may help.`;
    } else {
      label = "Low confidence"; cls = "low";
      note = "The model is not sure about this one. The photo may be unclear, or the fish may not be one of the six species it knows. Treat this as a guess.";
    }
    el.topConfLabel.textContent = label;
    el.topConfLabel.className = `conf-label ${cls}`;
    el.topNote.textContent = note;

    el.probList.innerHTML = ranked.map((r, i) => `
      <li class="${i === 0 ? "top" : ""}">
        <span class="p-name">${info(r.key).name}</span>
        <span class="bar"><span data-w="${(r.p * 100).toFixed(1)}"></span></span>
        <span class="p-val">${pct(r.p)}</span>
      </li>`).join("");

    el.topTells.innerHTML = s.tells.map((t) => `<li>${t}</li>`).join("");

    el.topMeter.style.width = "0";
    showState("result");

    // Animate bars after the result is visible.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.topMeter.style.width = `${(top.p * 100).toFixed(1)}%`;
      el.probList.querySelectorAll(".bar span").forEach((b) => { b.style.width = `${b.dataset.w}%`; });
    }));

    if (window.matchMedia("(max-width: 1020px)").matches) {
      el.resBody.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ==========================================================
     Events
     ========================================================== */
  el.chooseBtn.addEventListener("click", () => el.fileInput.click());
  el.cameraBtn.addEventListener("click", () => el.cameraInput.click());
  el.fileInput.addEventListener("change", () => acceptFile(el.fileInput.files[0]));
  el.cameraInput.addEventListener("change", () => acceptFile(el.cameraInput.files[0]));
  el.removeBtn.addEventListener("click", clearImage);
  el.againBtn.addEventListener("click", identify);
  el.errorRetry.addEventListener("click", () => { sessionPromise = null; identify(); });
  el.moreBtn.addEventListener("click", () => lastTopKey && openProfile(lastTopKey));

  ["dragenter", "dragover"].forEach((evt) =>
    el.dropZone.addEventListener(evt, (e) => { e.preventDefault(); el.dropZone.classList.add("dragging"); })
  );
  ["dragleave", "drop"].forEach((evt) =>
    el.dropZone.addEventListener(evt, (e) => { e.preventDefault(); el.dropZone.classList.remove("dragging"); })
  );
  el.dropZone.addEventListener("drop", (e) => acceptFile(e.dataTransfer.files[0]));

  // Stop the browser from opening a file that is dropped outside the drop zone.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  // Paste an image from the clipboard.
  window.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) acceptFile(item.getAsFile());
  });

  /* ==========================================================
     Start
     ========================================================== */
  (async function init() {
    await loadLabels();
    buildSpeciesGrid();
    setFishImage($("topImg"), CONFIG.classes[0]);
    // Start loading the model quietly so the first result is fast.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    idle(() => loadModel());
  })();
})();
