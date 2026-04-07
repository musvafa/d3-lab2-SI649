// Find TODO statements and complete them to build the interactive airline route map.

// TODO: add your uniqname to the HTML (use id #uniqname) file so that your work can be identified
d3.select("#uniqname").text("mustafa"); // ← replace with your actual uniqname

// TODO: import data using d3.csv()
const dataFile = await d3.csv("data/routes.csv");

const colornone = "#ccc";
// define colors for airlines, you can expand this as needed, WN is Southwest, B6 is JetBlue
const airlineColor = { WN: "orange", B6: "steelblue" };
const airlineName  = { WN: "Southwest Airlines", B6: "JetBlue" };

// create options from selector that allows us to view all airlines or filter by a specific airline
const airlines = ["all", ...new Set(dataFile.map(d => d.Airline))];

// build selector from data
const select = d3.select("body")
    .insert("select", "#chart")
    .on("change", function () { draw(this.value); });

select.selectAll("option")
    .data(airlines)
    .join("option")
    .attr("value", d => d)
    // TODO: build options from selector that allows us to view all airlines or filter by a specific airline
    .text(d => d === "all" ? "All Airlines" : (airlineName[d] || d));

// helper function to build outgoing links for each leaf node
function bilink(root) {
    const map = new Map(root.leaves().map(d => [id(d), d]));
    for (const d of root.leaves()) {
        d.outgoing = d.data.destinations
            .map(({ target, airline, targetRegion }) => [d, map.get(`root/${targetRegion}/${target}`), airline])
            .filter(([, target]) => target !== undefined);
    }
    return root;
}

// helper function to generate a unique ID for each node
function id(node) {
    return `${node.parent ? id(node.parent) + "/" : ""}${node.data.name}`;
}

// rebuild hierarchy data and redraw chart on selection change
function draw(airlineFilter) {
    const filtered = airlineFilter === "all"
        ? dataFile
        : dataFile.filter(d => d.Airline === airlineFilter);

    const grouped = d3.group(filtered, d => d["Source region"], d => d["Source airport"]);

    const hierarchyData = {
        name: "root",
        children: Array.from(grouped, ([region, airports]) => ({
            name: region,
            children: Array.from(airports, ([airport, routes]) => ({
                name: airport,
                destinations: routes.map(r => ({
                    target: r["Destination airport"],
                    airline: r.Airline,
                    targetRegion: r["Destination region"]
                }))
            }))
        }))
    };

    document.getElementById("chart").innerHTML = "";
    document.getElementById("chart").appendChild(createChart(hierarchyData));
}

draw("all"); // initial draw

// TODO: integrate code from Observable notebook https://observablehq.com/@d3/hierarchical-edge-bundling
// TODO: edit the tooltip to show the airport code, the region, and the number of outgoing and incoming routes for that airport
// TODO: edit link to show different colors for different airlines, you can use the airlineColor object defined above for reference
// TODO: edit overed and outed functions to highlight connected links and nodes on hover
function createChart(data) {
    const width  = 900;
    const radius = width / 2;

    const tree = d3.cluster().size([2 * Math.PI, radius - 160]);
    const root = bilink(
        tree(
            d3.hierarchy(data).sort((a, b) =>
                d3.ascending(a.height, b.height) || d3.ascending(a.data.name, b.data.name)
            )
        )
    );

    const svg = d3.create("svg")
        .attr("width",   width)
        .attr("height",  width)
        .attr("viewBox", [-radius, -radius, width, width])
        .attr("style",   "max-width: 100%; height: auto; font: 10px sans-serif;");

    const line = d3.lineRadial()
        .curve(d3.curveBundle.beta(0.85))
        .radius(d => d.y)
        .angle(d => d.x);

    // TODO: edit link to show different colors for different airlines
    const link = svg.append("g")
        .attr("fill",           "none")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width",   1)
        .selectAll("path")
        .data(root.leaves().flatMap(leaf => leaf.outgoing))
        .join("path")
            .style("mix-blend-mode", "multiply")
            .attr("stroke", ([source,, airline]) => airlineColor[airline] || colornone)
            .attr("d", ([source, target]) => line(source.path(target)))
            .each(function (d) { d.path = this; });

    // TODO: edit overed and outed + tooltip
    const node = svg.append("g")
        .selectAll("g")
        .data(root.leaves())
        .join("g")
            .attr("transform", d =>
                `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`)
            .append("text")
                .attr("dy",          "0.31em")
                .attr("x",           d => d.x < Math.PI ? 8 : -8)
                .attr("text-anchor", d => d.x < Math.PI ? "start" : "end")
                .attr("transform",   d => d.x >= Math.PI ? "rotate(180)" : null)
                .text(d => d.data.name)
                .each(function (d) { d.text = this; })
                .on("mouseover", overed)
                .on("mouseout",  outed)
                // TODO: tooltip showing airport code, region, outgoing and incoming route counts
                .call(text => text.append("title").text(d => {
                    const outCount = d.outgoing ? d.outgoing.length : 0;
                    const inCount  = root.leaves().filter(n =>
                        n.outgoing && n.outgoing.some(([, t]) => t === d)
                    ).length;
                    const region = d.parent ? d.parent.data.name : "";
                    return `${d.data.name} (${region})\nOutgoing routes: ${outCount}\nIncoming routes: ${inCount}`;
                }));

    // TODO: overed — highlight connected links and nodes on hover
    function overed(event, d) {
        link
            .style("stroke-opacity", ([source, target]) =>
                source === d || target === d ? 1 : 0.05)
            .style("stroke", ([source, target, airline]) => {
                if (source === d || target === d) return airlineColor[airline] || colornone;
                return colornone;
            })
            .filter(([source, target]) => source === d || target === d)
            .raise();

        node
            .attr("font-weight", n => {
                if (n === d) return "bold";
                if (d.outgoing && d.outgoing.some(([, t]) => t === n)) return "bold";
                if (root.leaves().some(l => l.outgoing && l.outgoing.some(([s, t]) => s === n && t === d))) return "bold";
                return null;
            })
            .attr("fill", n => {
                if (n === d) return "black";
                if (d.outgoing && d.outgoing.some(([, t]) => t === n)) return "darkorange";
                if (root.leaves().some(l => l.outgoing && l.outgoing.some(([s, t]) => s === n && t === d))) return "steelblue";
                return "#ccc";
            });
    }

    // TODO: outed — reset all highlights
    function outed(event, d) {
        link
            .style("stroke-opacity", 0.6)
            .style("stroke", ([source,, airline]) => airlineColor[airline] || colornone);

        node
            .attr("font-weight", null)
            .attr("fill",        null);
    }

    return svg.node();
}