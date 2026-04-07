// =============================================================================
// D3 Hierarchical Edge Bundling – Airline Routes
// SI 649 Lab 2  |  Based on: https://observablehq.com/@d3/hierarchical-edge-bundling
// =============================================================================

(function () {
  // ---------------------------------------------------------------------------
  // 1.  DIMENSIONS & CONSTANTS
  // ---------------------------------------------------------------------------
  const width       = 860;
  const radius      = width / 2;
  const innerRadius = radius - 130;   // label ring starts here

  // Edge colours
  const COLOR_OUT  = "darkorange";   // routes leaving the hovered airport
  const COLOR_IN   = "steelblue";    // routes arriving at the hovered airport
  const COLOR_NONE = "#ccc";         // default (no hover)

  // ---------------------------------------------------------------------------
  // 2.  D3 LAYOUT & LINE GENERATORS
  // ---------------------------------------------------------------------------
  const cluster = d3.cluster().size([360, innerRadius]);

  const line = d3.radialLine()
    .curve(d3.curveBundle.beta(0.85))
    .radius(d => d.y)
    .angle(d => (d.x / 180) * Math.PI);

  // ---------------------------------------------------------------------------
  // 3.  SVG SETUP
  // ---------------------------------------------------------------------------
  // The index.html is expected to contain a container element, e.g.
  //   <div id="chart"></div>
  // and a <select id="airline-select"> with an "All Airlines" option already
  // present (or we add it here).
  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", [-radius, -radius, width, width])
    .attr("width",  width)
    .attr("height", width);

  // Two groups: links first (drawn behind), nodes on top
  const gLinks = svg.append("g");
  const gNodes = svg.append("g");

  // These selections are re-bound on every render()
  let linkSel = gLinks.selectAll("path");
  let nodeSel = gNodes.selectAll("text");

  // ---------------------------------------------------------------------------
  // 4.  MODULE-LEVEL DATA STORE
  // ---------------------------------------------------------------------------
  let allAirports = [];   // full airports array
  let allRoutes   = [];   // full routes array
  let airportMap  = new Map(); // iata -> airport object

  // ---------------------------------------------------------------------------
  // 5.  DATA LOADING
  // ---------------------------------------------------------------------------
  Promise.all([
    d3.csv("data/airports.csv"),
    d3.csv("data/routes.csv")
  ]).then(([airports, routes]) => {

    allAirports = airports;
    allRoutes   = routes;
    airportMap  = new Map(airports.map(a => [a.iata, a]));

    // Populate the airline <select>
    const airlines = Array.from(new Set(routes.map(d => getCol(d, "airline"))))
      .filter(Boolean)
      .sort();

    const sel = d3.select("#airline-select");

    // Ensure "All Airlines" option exists
    if (sel.select("option[value='All Airlines']").empty()) {
      sel.insert("option", ":first-child")
        .attr("value", "All Airlines")
        .text("All Airlines");
    }

    airlines.forEach(a => {
      sel.append("option").attr("value", a).text(a);
    });

    // Wire up the change handler
    sel.on("change", function () {
      render(this.value === "All Airlines" ? null : this.value);
    });

    // Initial render with all airlines
    render(null);
  });

  // ---------------------------------------------------------------------------
  // 6.  MAIN RENDER FUNCTION
  // ---------------------------------------------------------------------------
  function render(selectedAirline) {

    // -- 6a. Filter routes ----------------------------------------------------
    const routes = selectedAirline
      ? allRoutes.filter(d => getCol(d, "airline") === selectedAirline)
      : allRoutes;

    // -- 6b. Determine which airports appear in the filtered routes -----------
    const activeIatas = new Set();
    routes.forEach(r => {
      const src = getCol(r, "src");
      const dst = getCol(r, "dst");
      if (src) activeIatas.add(src);
      if (dst) activeIatas.add(dst);
    });

    const airports = allAirports.filter(a => activeIatas.has(a.iata));

    // -- 6c. Build imports map  (iata -> [destination iata, ...]) -------------
    const importMap = new Map(airports.map(a => [a.iata, []]));
    routes.forEach(r => {
      const src = getCol(r, "src");
      const dst = getCol(r, "dst");
      if (importMap.has(src) && activeIatas.has(dst)) {
        importMap.get(src).push(dst);
      }
    });

    // -- 6d. Convert to hierarchical class objects ----------------------------
    const classes = airports.map(a => ({
      name:    hierName(a),          // e.g. "US.TX.AUS"
      key:     a.iata,               // short label on the circle
      imports: (importMap.get(a.iata) || [])
                 .map(dst => {
                   const dstAp = airportMap.get(dst);
                   return dstAp ? hierName(dstAp) : null;
                 })
                 .filter(Boolean)
    }));

    // -- 6e. Build the d3 hierarchy -------------------------------------------
    const root   = buildHierarchy(classes);
    cluster(root);
    const leaves = root.leaves();

    // -- 6f. Compute bundled paths between leaves ------------------------------
    const nameToLeaf = new Map(leaves.map(d => [d.data.name, d]));

    const links = [];
    leaves.forEach(leaf => {
      (leaf.data.imports || []).forEach(importName => {
        if (nameToLeaf.has(importName)) {
          links.push(leaf.path(nameToLeaf.get(importName)));
        }
      });
    });

    // -- 6g. Render LINKS ------------------------------------------------------
    linkSel = linkSel.data(links);
    linkSel.exit().remove();
    linkSel = linkSel.enter()
      .append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.45)
      .merge(linkSel)
        // Attach source/target references for fast hover lookup
        .each(function (d) {
          d.source = d[0];
          d.target = d[d.length - 1];
        })
        .attr("d", line)
        .attr("stroke", COLOR_NONE);

    // -- 6h. Render NODES (airport labels) ------------------------------------
    nodeSel = nodeSel.data(leaves, d => d.data.name);
    nodeSel.exit().remove();
    nodeSel = nodeSel.enter()
      .append("text")
        .attr("class", "node")
        .attr("dy", "0.31em")
        .attr("font-family", "sans-serif")
        .attr("font-size", "10px")
        .on("mouseover", mouseovered)
        .on("mouseout",  mouseouted)
      .merge(nodeSel)
        .attr("transform", d =>
          `rotate(${d.x - 90}) translate(${innerRadius + 8}, 0)${d.x >= 180 ? " rotate(180)" : ""}`)
        .attr("text-anchor", d => d.x < 180 ? "start" : "end")
        .attr("fill", "#333")
        .attr("font-weight", null)
        .text(d => d.data.key || d.data.name.split(".").pop());
  }

  // ---------------------------------------------------------------------------
  // 7.  HOVER INTERACTIONS
  // ---------------------------------------------------------------------------
  function mouseovered(event, d) {
    // Reset all flags
    nodeSel.each(n => { n._target = false; n._source = false; });

    // Colour links and set flags on connected nodes
    linkSel
      .attr("stroke", l => {
        if (l.target === d) { l.source._source = true; return COLOR_IN;   }
        if (l.source === d) { l.target._target = true; return COLOR_OUT;  }
        return COLOR_NONE;
      })
      .attr("stroke-opacity", l =>
        (l.source === d || l.target === d) ? 0.85 : 0.15)
      // Bring highlighted links to the front
      .filter(l => l.source === d || l.target === d)
      .raise();

    // Colour nodes
    nodeSel
      .attr("fill", n => {
        if (n === d)         return "#000";
        if (n._target)       return COLOR_OUT;
        if (n._source)       return COLOR_IN;
        return "#aaa";
      })
      .attr("font-weight", n =>
        (n === d || n._target || n._source) ? "bold" : null);
  }

  function mouseouted(event, d) {
    linkSel
      .attr("stroke", COLOR_NONE)
      .attr("stroke-opacity", 0.45);

    nodeSel
      .attr("fill", "#333")
      .attr("font-weight", null);
  }

  // ---------------------------------------------------------------------------
  // 8.  HELPER: build hierarchical name  (root.group.iata)
  // ---------------------------------------------------------------------------
  function hierName(airport) {
    const country = (airport.country || "").trim();
    const isUS = country === "United States" ||
                 country === "US"            ||
                 country === "USA";

    if (isUS) {
      // Group US airports by state code
      const state = (airport.state || "XX").trim().substring(0, 2).toUpperCase();
      return `US.${state}.${airport.iata}`;
    } else {
      // Group international airports by country
      // Replace dots so they don't break the hierarchy parser
      const safeCountry = (country || "Unknown").replace(/\./g, "_");
      return `Intl.${safeCountry}.${airport.iata}`;
    }
  }

  // ---------------------------------------------------------------------------
  // 9.  HELPER: build d3.hierarchy from flat class list
  //     (same pattern as the Observable example)
  // ---------------------------------------------------------------------------
  function buildHierarchy(classes) {
    const map = {};

    function find(name, data) {
      let node = map[name];
      if (!node) {
        node = map[name] = data || { name: name, children: [] };
        if (name.length) {
          const i = name.lastIndexOf(".");
          node.parent = find(name.substring(0, i));
          node.parent.children.push(node);
          node.key = name.substring(i + 1);
        }
      }
      return node;
    }

    classes.forEach(d => find(d.name, d));

    return d3.hierarchy(map[""]).sum(d => d.size || 0);
  }

  // ---------------------------------------------------------------------------
  // 10. HELPER: flexible CSV column accessor
  //     Handles common variations in column naming across data files.
  // ---------------------------------------------------------------------------
  function getCol(row, field) {
    switch (field) {
      case "airline":
        return row.airline   ||
               row.Airline   ||
               row.carrier   ||
               row.Carrier   || null;

      case "src":
        return row.src               ||
               row.source            ||
               row.origin            ||
               row["Source airport"] ||
               row.from              || null;

      case "dst":
        return row.dst                       ||
               row.destination              ||
               row.dest                     ||
               row["Destination airport"]   ||
               row.to                       || null;

      default:
        return row[field] || null;
    }
  }

})();