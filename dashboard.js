const height = 300;
const margin = { top: 20, right: 20, bottom: 60, left: 60 };

const yearStart = document.getElementById("yearStart");
const yearEnd   = document.getElementById("yearEnd");
const yearLabel = document.getElementById("yearLabel");
const yearFill  = document.getElementById("yearFill");

const kpiTotal = document.getElementById("kpiTotal");
const kpiYoY   = document.getElementById("kpiYoY");

const tooltip = d3.select("#tooltip");

let update;
let selectedCountryFromBar = null;
let selectedCountryFromTreemap = null;

function getChartWidth(svgId) {
    const svg = document.getElementById(svgId);
    return svg.getBoundingClientRect().width - margin.left - margin.right;
}

function updateYearFill() {
    const min = +yearStart.min;
    const max = +yearStart.max;

    let start = +yearStart.value;
    let end   = +yearEnd.value;
    if (start > end) [start, end] = [end, start];

    const range = max - min;
    const r = 7;
    const w = yearStart.offsetWidth - 2 * r;

    yearFill.style.left  = `${r + ((start - min) / range) * w}px`;
    yearFill.style.width = `${((end - start) / range) * w}px`;

    yearLabel.textContent = `${start} – ${end}`;
}

d3.csv("preprocessed_co2.csv", d3.autoType).then(data => {

    function createDropdown(dropdownId, optionsId, values) {
        const dropdown = document.getElementById(dropdownId);
        const box = document.getElementById(optionsId);
        const toggle = dropdown.querySelector(".dropdown-toggle");

        values.forEach(v => {
            const label = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.value = v;
            cb.checked = true;
            label.append(cb, document.createTextNode(v));
            box.appendChild(label);
        });

        function updateLabel() {
            const n = box.querySelectorAll("input:checked").length;
            toggle.textContent =
                n === values.length ? "All selected" :
                n === 0 ? "None selected" :
                `${n} selected`;
        }

        box.addEventListener("change", () => {
            updateLabel();
            update();
        });

        dropdown.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", e => {
                const all = e.target.dataset.action === "all";
                box.querySelectorAll("input").forEach(cb => cb.checked = all);
                updateLabel();
                update();
            });
        });

        updateLabel();

        return () =>
            Array.from(box.querySelectorAll("input:checked"))
                .map(cb => cb.value);
    }

    const regions = [...new Set(
        data
            .map(d => d.region)
            .filter(v => v !== null && v !== undefined && v !== "")
    )].sort();

    const incomes = [...new Set(
        data
            .map(d => d.income_level)
            .filter(v => v !== null && v !== undefined && v !== "")
    )].sort();


    const getRegions = createDropdown("regionDropdown","regionOptions",regions);
    const getIncomes = createDropdown("incomeDropdown","incomeOptions",incomes);

    function baseFilteredData() {
        let s = +yearStart.value;
        let e = +yearEnd.value;
        if (s > e) [s, e] = [e, s];

        return data.filter(d =>
            d.year >= s &&
            d.year <= e &&
            getRegions().includes(d.region) &&
            getIncomes().includes(d.income_level)
        );
    }

    function dataForBarChart() {
    const base = baseFilteredData();

    if (selectedCountryFromBar)
        return base.filter(d => d.country === selectedCountryFromBar);

    return base;
    }

    function dataForTreemap() {
    const base = baseFilteredData();

    if (selectedCountryFromTreemap)
        return base.filter(d => d.country === selectedCountryFromTreemap);

    return base;
    }

    function filteredDataForMainCharts() {
        const base = baseFilteredData();

        if (selectedCountryFromBar)
            return base.filter(d => d.country === selectedCountryFromBar);

        if (selectedCountryFromTreemap)
            return base.filter(d => d.country === selectedCountryFromTreemap);

        return base;
    }

    function updateKPI(df) {
        if (df.length === 0) {
            kpiTotal.textContent = "—";
            kpiYoY.textContent = "";
            return;
        }

        const yearly = d3.rollups(
            df,
            v => d3.sum(v, d => d.co2),
            d => d.year
        ).sort((a, b) => a[0] - b[0]);

        const totalRange = d3.sum(yearly, d => d[1]);
        const [lastYear, lastValue] = yearly.at(-1);

        let yoy = null;
        let yoyText = "YoY: —";
        let yoyColor = "#6b7280";

        if (yearly.length >= 2) {
            const [prevYear, prevValue] = yearly.at(-2);
            yoy = ((lastValue - prevValue) / prevValue) * 100;

            yoyText = `YoY vs ${prevYear}: ${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`;

            if (yoy > 0) {
                yoyColor = "#d97706";
            } else if (yoy < 0) {
                yoyColor = "#2563eb";
            }
        }

        const activeCountry =
            selectedCountryFromBar || selectedCountryFromTreemap;

        const suffix = activeCountry ? ` - ${activeCountry}` : "";

        kpiTotal.innerHTML = `
            <div style="font-size:13px;color:#666">
                (${yearly[0][0]}–${lastYear})${suffix}
            </div>
            <div style="font-size:28px;font-weight:700">
                ${Math.round(totalRange).toLocaleString()} Mt
            </div>
        `;

        kpiYoY.innerHTML = `
            <div style="margin-top:6px">
                <b>${Math.round(lastValue).toLocaleString()} Mt</b> (${lastYear})<br>
                <span style="color:${yoyColor}; font-weight:600">
                    ${yoyText}
                </span>
            </div>
        `;
    }

    function drawLine(df) {
        const width = getChartWidth("lineChart");

        const svg = d3.select("#lineChart").html("")
            .append("g")
            .attr("transform",`translate(${margin.left},${margin.top})`);

        const yearly = d3.rollups(df,v=>d3.sum(v,d=>d.co2),d=>d.year)
            .sort((a,b)=>a[0]-b[0]);

        const yExtent = d3.extent(yearly, d => d[1]);
        const padding = (yExtent[1] - yExtent[0]) * 0.15;

        const x = d3.scaleLinear()
            .domain(d3.extent(yearly,d=>d[0]))
            .range([0,width]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(yearly, d => d[1])])
            .nice()
            .range([height, 0]);

        svg.append("path")
            .datum(yearly)
            .attr("fill","none")
            .attr("stroke","#1f77b4")
            .attr("stroke-width",2.5)
            .attr("d",d3.line().x(d=>x(d[0])).y(d=>y(d[1])));

        svg.selectAll("circle")
            .data(yearly)
            .enter().append("circle")
            .attr("cx",d=>x(d[0]))
            .attr("cy",d=>y(d[1]))
            .attr("r",3)
            .attr("fill","#1f77b4")
            .on("mouseenter",(e,d)=>{
                tooltip.style("opacity",1)
                    .html(`<b>${d[0]}</b><br>${Math.round(d[1]).toLocaleString()} Mt`);
            })
            .on("mousemove",e=>{
                tooltip.style("left",`${e.pageX+10}px`)
                       .style("top",`${e.pageY-20}px`);
            })
            .on("mouseleave",()=>tooltip.style("opacity",0));

        svg.append("g")
            .attr("transform",`translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")));

        svg.append("g").call(d3.axisLeft(y));
    }

    function drawBars(df) {
        const width = getChartWidth("barChart");

        const svg = d3.select("#barChart").html("")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const top = d3.rollups(
            df,
            v => d3.sum(v, d => d.co2),
            d => d.country
        )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

        if (top.length === 0) return;

        const x = d3.scaleLinear()
            .domain([0, d3.max(top, d => d[1])])
            .range([0, width]);

        const y = d3.scaleBand()
            .domain(top.map(d => d[0]))
            .range([0, height])
            .padding(0.25);

        svg.selectAll("rect")
            .data(top)
            .enter()
            .append("rect")
            .attr("y", d => y(d[0]))
            .attr("height", y.bandwidth())
            .attr("width", d => x(d[1]))
            .attr("fill", d =>
                selectedCountryFromBar === d[0] ? "#1f77b4" : "#6baed6"
            )
            .attr("opacity", d =>
                selectedCountryFromBar && selectedCountryFromBar !== d[0] ? 0.4 : 1
            )
            .style("cursor", "pointer")
            .on("mouseenter", (e, d) => {
                tooltip.style("opacity", 1)
                    .html(`<b>${d[0]}</b><br>${Math.round(d[1]).toLocaleString()} Mt`);
            })
            .on("mousemove", e => {
                tooltip
                    .style("left", `${e.pageX + 10}px`)
                    .style("top", `${e.pageY - 20}px`);
            })
            .on("mouseleave", () => tooltip.style("opacity", 0))
            .on("click", (e, d) => {
                selectedCountryFromBar = selectedCountryFromBar === d[0] ? null : d[0];
                update();
            });

        svg.append("g").call(d3.axisLeft(y));
    }

    function drawStacked(df) {
        const width = getChartWidth("stackedChart");

        const svg = d3.select("#stackedChart").html("")
            .append("g")
            .attr("transform",`translate(${margin.left},${margin.top})`);

        const keys = ["coal_co2","oil_co2","gas_co2","cement_co2"];

        const yearly = d3.rollups(df,v=>{
            const o={};
            keys.forEach(k=>o[k]=d3.sum(v,d=>d[k]||0));
            return o;
        },d=>d.year).map(d=>({year:d[0],...d[1]}));

        const stack = d3.stack().keys(keys)(yearly);

        const x = d3.scaleLinear()
            .domain(d3.extent(yearly,d=>d.year))
            .range([0,width]);

        const y = d3.scaleLinear()
            .domain([0,d3.max(stack.at(-1),d=>d[1])])
            .range([height,0]);

        const color = d3.scaleOrdinal()
            .domain(keys)
            .range(["#9ecae1","#6baed6","#3182bd","#08519c"]);

        svg.selectAll("path")
            .data(stack)
            .enter().append("path")
            .attr("fill",d=>color(d.key))
            .attr("d",d3.area()
                .x(d=>x(d.data.year))
                .y0(d=>y(d[0]))
                .y1(d=>y(d[1])))
            .on("mousemove",(e,d)=>{
                const year = Math.round(x.invert(d3.pointer(e)[0]));
                const p = d.find(v=>v.data.year===year);
                if(!p)return;
                tooltip.style("opacity",1)
                    .html(`<b>${d.key.replace("_co2","")}</b><br>${year}<br>${Math.round(p[1]-p[0]).toLocaleString()} Mt`)
                    .style("left",`${e.pageX+10}px`)
                    .style("top",`${e.pageY-20}px`);
            })
            .on("mouseleave",()=>tooltip.style("opacity",0));

            const midYear = Math.round(d3.mean(yearly, d => d.year));

            svg.selectAll(".stack-label")
                .data(stack)
                .enter()
                .append("text")
                .attr("class", "stack-label")
                .attr("x", d => x(midYear))
                .attr("y", d => {
                    const seg = d.find(v => v.data.year === midYear - 2);
                    if (!seg) return -100;

                    const yMid = (seg[0] + seg[1]) / 2;
                    return y(yMid);
                })
                .text(d => {
                    const name = d.key.replace("_co2", "");
                    return name.charAt(0).toUpperCase() + name.slice(1);
                })

                .attr("fill", "#ffffff")
                .attr("font-size", "10px")
                .attr("font-weight", 400)
                .attr("text-anchor", "middle")
                .attr("pointer-events", "none")
                .style("opacity", d => {
                    const seg = d.find(v => v.data.year === midYear);
                    if (!seg) return 0;

                    const thickness = y(seg[0]) - y(seg[1]);
                    return thickness > 18 ? 1 : 0;
                });

        svg.append("g")
            .attr("transform",`translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")));

        svg.append("g").call(d3.axisLeft(y));
    }

function drawTreemap(df) {
    const width = getChartWidth("treemapChart");
    const height = 360;

    const svg = d3.select("#treemapChart")
        .attr("height", height)
        .html("");

    const byCountry = d3.rollups(
        df,
        v => d3.sum(v, d => d.co2),
        d => d.country
    )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

    if (byCountry.length === 0) return;

    const totalTop10 = d3.sum(byCountry, d => d.value);

    const root = d3.hierarchy({ children: byCountry })
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .size([width, height])
        .paddingInner(2)
        .round(true)
        (root);

    const color = d3.scaleSequential()
        .domain([0, d3.max(byCountry, d => d.value)])
        .interpolator(d3.interpolateBlues);

    const node = svg.selectAll("g")
        .data(root.leaves())
        .enter()
        .append("g")
        .attr("transform", d =>
            `translate(${Math.round(d.x0)},${Math.round(d.y0)})`
        )
        .style("cursor", "pointer");

    node.append("rect")
        .attr("width", d => Math.max(0, Math.round(d.x1 - d.x0)))
        .attr("height", d => Math.max(0, Math.round(d.y1 - d.y0)))
        .attr("fill", d =>
            selectedCountryFromTreemap === d.data.name
                ? "#1f77b4"
                : color(d.data.value)
        )
        .attr("opacity", d =>
            selectedCountryFromTreemap && selectedCountryFromTreemap !== d.data.name ? 0.4 : 1
        )
        .on("mousemove", (e, d) => {
            tooltip
                .style("opacity", 1)
                .html(
                    `<b>${d.data.name}</b><br>
                     ${Math.round(d.data.value).toLocaleString()} Mt<br>
                     ${(d.data.value / totalTop10 * 100).toFixed(1)}% of Top-10`
                )
                .style("left", `${e.pageX + 10}px`)
                .style("top", `${e.pageY - 20}px`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .on("click", (e, d) => {
            selectedCountryFromTreemap =
                selectedCountryFromTreemap === d.data.name ? null : d.data.name;
            update();
        });

    node.each(function (d, i) {
        const w = Math.round(d.x1 - d.x0);
        const h = Math.round(d.y1 - d.y0);
        const area = w * h;

        if (w < 60 || h < 24 || area < 2500) return;

        let lines = [];
        let fontSize = 11;

        if (area > 9000 && h > 42) {
            lines = [
                d.data.name,
                `${(d.data.value / totalTop10 * 100).toFixed(1)}%`
            ];
            fontSize = 12;
        } else if (area > 4500) {
            lines = [d.data.name];
            fontSize = 11;
        } else {
            lines = [d.data.name.slice(0, 12)];
            fontSize = 10;
        }

        const clipId = `clip-tm-${i}`;

        d3.select(this)
            .append("clipPath")
            .attr("id", clipId)
            .append("rect")
            .attr("width", w)
            .attr("height", h);

        const text = d3.select(this)
            .append("text")
            .attr("clip-path", `url(#${clipId})`)
            .attr("x", w / 2)
            .attr("y", h / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("fill", "#fff")
            .attr("font-size", fontSize)
            .attr("pointer-events", "none");

        lines.forEach((line, idx) => {
            text.append("tspan")
                .attr("x", w / 2)
                .attr("dy", idx === 0 ? "0em" : "1.2em")
                .text(line);
        });
    });
}

    update = function () {
        updateYearFill();

        const mainDf = filteredDataForMainCharts();

        updateKPI(mainDf);
        drawLine(mainDf);
        drawStacked(mainDf);

        drawBars(dataForBarChart());
        drawTreemap(dataForTreemap());
    };

    update();
});

yearStart.addEventListener("input",()=>update && update());
yearEnd.addEventListener("input",()=>update && update());

document.querySelectorAll(".dropdown").forEach(dropdown => {

    dropdown.addEventListener("click", e => {
        e.stopPropagation();
    });

    const toggle = dropdown.querySelector(".dropdown-toggle");

    toggle.addEventListener("click", e => {
        e.stopPropagation();

        document.querySelectorAll(".dropdown.open").forEach(d => {
            if (d !== dropdown) d.classList.remove("open");
        });

        dropdown.classList.toggle("open");
    });
});

document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown.open")
        .forEach(d => d.classList.remove("open"));
});
