"""Rebuild Sip-Stack charts 02 (white) and 03 (red) as variety-analysis charts.
Single source of truth -> markdown files, full pack sections, docs/index.html panels."""
import html, re, pathlib

NOTE = ("> Original Sip Studies teaching material. Variety names are public, common names. "
        "Not affiliated with, endorsed by, or derived from any court, guild, or credentialing body.")

COLS = ["Variety", "Sip Family", "Vine traits", "Climate fit", "Structure (acidity · body · grip)",
        "Style cues", "Place patterns", "Water / Give-Back note"]

WHITES = [
 ("Albariño", "Crisp", "Thick-skinned, holds up to damp sea air; often grown on high pergolas", "Cool, wet, coastal", "High · light–medium · none", "Mostly steel tank, no oak; dry; sometimes rests on its yeast for texture", "Atlantic Iberia (Galicia, northern Portugal as Alvarinho); a few US coastal sites", "Rain-fed coastal vineyards: compare to drought-stressed inland sites"),
 ("Chardonnay", "Rich (can be Crisp)", "Early budding, frost-prone; very adaptable, a winemaker's blank canvas", "Cool to warm; style follows climate", "Medium–high · medium–full · none", "Widest range: steel and lean, or barrel-fermented, buttery, and round; also a core sparkling grape", "Burgundy and Champagne home; California, Australia, Chile, Oregon, many more", "Same grape, many climates: a lesson in how water and heat shape one plant"),
 ("Chenin Blanc", "Crisp → Rich", "Vigorous, buds early, ripens late; prone to noble rot in misty sites", "Cool-moderate to warm", "Very high · light–full · none", "Every sweetness level from bone dry to dessert; still or sparkling; oak optional", "Loire Valley home; South Africa's most planted white; some California", "South African old bush vines are often dry-farmed: a water-wise model"),
 ("Gewürztraminer", "Floral", "Pink-skinned, low-yielding, buds early; sensitive to frost and disease", "Cool, sunny, dry autumns", "Low · full · slight phenolic grip", "Dry to sweet; usually no oak; perfumed and oily-textured", "Alsace, northern Italy (Alto Adige), Germany; cool US/NZ sites", "Low-acid grape: teach why cool nights (and water in the soil) keep it balanced"),
 ("Pinot Grigio / Pinot Gris", "Crisp (Grigio) · Rich (Gris)", "Grey-pink skin, a color mutation of Pinot Noir; early ripening", "Cool to moderate", "Medium · light–full · none", "Two names, two styles: light and zippy (Grigio) or riper and rounder (Gris); rarely oaked", "Northeast Italy, Alsace, Oregon, New Zealand", "Mutation story: one vine family, many faces, same water needs"),
 ("Riesling", "Floral (and Crisp)", "Hard wood resists winter cold; late ripening; reflects soil strongly", "Cool, long seasons, steep slopes", "Very high · light–medium · none", "Bone dry to very sweet; almost never oaked; ages for decades", "Germany home; Alsace, Austria, Australia's cool valleys, New York Finger Lakes, Washington", "Steep river slopes: how rivers temper climate and support growers"),
 ("Sauvignon Blanc", "Crisp", "Vigorous vine; needs canopy control to keep grassy vs ripe balance", "Cool to moderate", "High · light–medium · none", "Mostly steel and fresh; some barrel-aged and blended with Sémillon", "Loire Valley and Bordeaux home; New Zealand, Chile, South Africa, California", "Irrigation and vigor: more water = more leaves = greener style"),
 ("Torrontés", "Floral", "Argentine crossing (Muscat parent); thrives at extreme altitude", "High-altitude desert: hot days, cold nights", "Medium · medium · slight", "Dry, unoaked, aromatic", "Argentina's high north (Salta) and Mendoza/La Rioja", "Desert vineyards rely on snowmelt irrigation: a direct water-access story"),
 ("Grüner Veltliner", "Crisp", "Native Austrian; high-yielding unless restrained; loves loess soils", "Cool continental", "High · light–full · none", "Mostly dry, unoaked; light everyday to rich reserve styles", "Austria (Danube valleys); small plantings in US, NZ, Australia", "Danube terraces: river water and stone walls that store heat"),
 ("Viognier", "Floral → Rich", "Low, irregular yields; needs full ripeness to show its character", "Warm, sunny", "Low · full · slight", "Dry, often lightly oaked; sometimes co-fermented with Syrah", "Northern Rhône home; California, Australia, Virginia", "Heat-loving grape: discuss water stress in warming climates"),
 ("Sémillon", "Rich", "Thin skin, prone to noble rot; ages into honeyed richness", "Moderate; misty autumns for sweet styles", "Low–medium · medium–full · none", "Dry blends with Sauvignon Blanc, or sweet botrytis wines; ages well", "Bordeaux (including sweet Sauternes); Australia (Hunter Valley)", "Morning river mist creates sweet wines: water as a winemaking ingredient"),
]

REDS = [
 ("Cabernet Franc", "Medium", "Buds and ripens earlier than Cabernet Sauvignon; hardy in cooler sites", "Cool to moderate", "Medium–high · medium · medium", "Unoaked and fresh or barrel-aged; key blending partner", "Loire Valley and Bordeaux; Finger Lakes, Virginia, Argentina", "Cooler-site grape: lower irrigation needs than many bold reds"),
 ("Cabernet Sauvignon", "Bold", "Small, thick-skinned berries; late ripening; offspring of Cabernet Franc × Sauvignon Blanc", "Warm, long seasons; gravelly, well-drained soils", "Medium–high · full · high", "Usually oak-aged; blended or single variety; long aging", "Bordeaux (Left Bank) home; Napa, Washington, Chile, Australia, South Africa", "Well-drained gravel: how soil holds or sheds water"),
 ("Gamay", "Light", "Early budding and ripening; high yielding", "Cool to moderate", "High · light · low", "Often whole-cluster fermented for juicy freshness; rarely oaked; served slightly cool", "Beaujolais home; Loire, Switzerland, Oregon", "Granite hillside vineyards rely on rain: a dry-farming story"),
 ("Grenache / Garnacha", "Medium → Bold", "Drought-tolerant bush vine; high sugar; thin-ish skin", "Hot, dry, windy", "Low–medium · full · medium", "Often blended (with Syrah, Mourvèdre); also rosé and fortified", "Southern Rhône, Spain (Priorat, Navarra, Aragón), Sardinia (Cannonau), Australia", "Drought-tolerant bush vines: the model for water-wise vineyards"),
 ("Malbec", "Bold", "Thick skins; benefits from strong sunlight at altitude", "High-altitude sun with cool nights; or warm southwest France", "Medium · full · medium–high", "Often oak-aged; deep color; single variety in Argentina", "Argentina (Mendoza) and Cahors, France", "Andean snowmelt irrigation: water access shapes a whole region"),
 ("Merlot", "Medium → Bold", "Early ripening, thinner skin than Cabernet; loves clay", "Moderate to warm", "Medium · medium–full · medium", "Often oak-aged; soft structure; major blending grape", "Bordeaux (Right Bank) home; Italy, Washington, California, Chile", "Clay soils hold water: compare to gravel sites for Cabernet"),
 ("Nebbiolo", "Bold (light color)", "Buds early, ripens very late; thin color but high tannin", "Cool-moderate, foggy autumns", "High · medium–full · high", "Long barrel and bottle aging; pale color fools the eye", "Piedmont (Barolo, Barbaresco) home; Valtellina; tiny New World plantings", "Named for fog (nebbia): water in the air is part of the identity"),
 ("Pinot Noir", "Light", "Thin-skinned, disease-prone, genetically unstable (many clones)", "Cool", "High · light–medium · low–medium", "Often aged in barrel gently; core sparkling grape", "Burgundy and Champagne home; Oregon, California coast, New Zealand, Germany (Spätburgunder)", "Fragile grape: canopy and moisture control as care, tie back to Chart 01"),
 ("Sangiovese", "Medium", "Many local clones; slow, late ripening", "Warm days, hillsides", "High · medium · medium–high", "Traditional large casks or small new oak; single variety or blended", "Tuscany (Chianti, Montalcino, Montepulciano) home; Romagna; some California, Australia", "Hill-town agriculture: shared water systems in rural communities"),
 ("Syrah / Shiraz", "Bold", "Vigorous; shows site strongly; two names signal two styles", "Moderate (Syrah) to hot (Shiraz)", "Medium · full · medium–high", "Oak-aged; sometimes co-fermented with Viognier; blend or solo", "Northern Rhône home; Australia (Barossa, McLaren Vale), Washington, Chile, South Africa", "Same grape, two names: how climate and water change a style"),
 ("Tempranillo", "Medium → Bold", "Thick-skinned; ripens early ('temprano' = early)", "Continental: hot days, cold nights", "Medium · medium–full · medium", "Classic long oak aging tiers from young to long-aged; also unoaked young styles", "Spain (Rioja, Ribera del Duero, Toro); Portugal (Tinta Roriz); some Texas, Oregon", "High dry plateaus: irrigation was restricted for decades in Spain"),
 ("Zinfandel / Primitivo", "Bold", "Uneven ripening in the same cluster; very old vines survive", "Warm to hot", "Medium · full · medium", "Oak-aged, high alcohol, jammy; also off-dry blush versions", "California (Lodi, Sonoma, Paso Robles); southern Italy (Puglia, as Primitivo); Croatian ancestor", "Century-old dry-farmed vines: heritage and water thrift together"),
 ("Barbera", "Medium", "Vigorous; keeps acidity even in heat", "Moderate to warm", "Very high · medium · low", "Unoaked and juicy or barrel-aged and richer", "Piedmont (Asti, Alba); California Sierra Foothills; Argentina", "Everyday table wine: affordable pours that can fund a Give-Back round-up"),
 ("Mourvèdre / Monastrell", "Bold", "Late budding and ripening; needs heat and water at the root", "Hot, coastal-Mediterranean", "Medium · full · high", "Often blended (GSM); can age long", "Bandol (Provence), Southern Rhône, Spain (Jumilla, Monastrell), Australia (Mataro)", "Needs warmth plus some water: a balance lesson for hot regions"),
]

def mermaid(kind):
    fam = ('["Crisp"]', '["Floral"]', '["Rich"]') if kind == "white" else ('["Light"]', '["Medium"]', '["Bold"]')
    skin = "Skin: green-gold, thin to thick" if kind == "white" else "Skin: color and tannin source"
    return f'''flowchart TD
  A["1 · Identity: name, synonyms, parents"] --> B["2 · Vine traits: budding, ripening, {skin.split(': ')[0].lower()}"]
  B --> C["3 · Climate fit: cool, moderate, warm"]
  C --> D["4 · Structural fingerprint: acidity, body, grip"]
  D --> E["5 · Sip Family"]
  E --> F1{fam[0]}
  E --> F2{fam[1]}
  E --> F3{fam[2]}
  F1 --> G["6 · Style outcomes: oak, sweetness, production"]
  F2 --> G
  F3 --> G
  G --> H["7 · Place patterns: home region and where it travelled"]
  H --> I["8 · Guest talk: one sentence, plain words"]
  I --> J["9 · Give-Back: the grape's water story"]'''

SPEC = {
 "02": dict(kind="white", rows=WHITES, file="02-white-grapes.md",
   title="White Grape Varieties — Species Analysis",
   purpose="Analyze the core white wine grapes as plants and as styles: who each variety is, where it grows best, how its structure reads, and how to explain it to a guest.",
   families="**Sip Families (white):** *Crisp* = high acid, light body, little or no oak · *Floral* = aromatic, perfumed, often lower acid or with sweetness · *Rich* = fuller body, often oak, ripeness, or lees texture. A variety can move between families depending on climate and winemaking (shown with →).",
   practice=["Run the nine-step analysis on one variety and fill one table row from memory", "Explain how climate moves a grape between Crisp and Rich (Chardonnay, Chenin Blanc)", "Name a variety's home region and one place it travelled to", "Say one guest-ready sentence per variety"],
   sourceflow="*Source:* name each variety, place it in its Sip Family, and give its climate fit and one home region. *Flow:* compare two varieties step by step (for example Riesling vs Gewürztraminer), predict style from climate and winemaking, and recommend one to a guest with a reason.",
   bridge="Grape spirits (brandies, pomace spirits) start from white grapes like Ugni Blanc, Folle Blanche, and Muscat relatives: same fruit, a different house.",
   give="Each variety row ends with a water note. Learners pick one white and write its water story in two sentences: how the vine gets its water and one way a grower saves it. Somm Support uses these stories at Water to Wine events.",
   hint="Sand background, Deep Teal table header, Mint Mist rows for Crisp, Mauve-Grey tint for Floral, Clay accent for Rich."),
 "03": dict(kind="red", rows=REDS, file="03-red-grapes.md",
   title="Red Grape Varieties — Species Analysis",
   purpose="Analyze the core red wine grapes as plants and as styles: skin, ripening, structure, place, and how to explain each one to a guest.",
   families="**Sip Families (red):** *Light* = pale, high acid, low grip · *Medium* = balanced fruit, acid, and grip; often savory · *Bold* = deep color or high tannin, full body, often oak. Skin thickness and climate decide most of the move between families (shown with →).",
   practice=["Run the nine-step analysis on one variety and fill one table row from memory", "Link skin thickness and ripening time to color and grip", "Explain synonym pairs (Syrah/Shiraz, Grenache/Garnacha, Zinfandel/Primitivo, Mourvèdre/Monastrell)", "Say one guest-ready sentence per variety"],
   sourceflow="*Source:* name each variety, place it in its Sip Family, and give its climate fit and one home region. *Flow:* compare two varieties step by step (for example Nebbiolo vs Pinot Noir: both pale, very different grip), predict style from site and winemaking, and guide a guest from one family to another.",
   bridge="Bold, oak-aged reds and barrel-aged spirits share vocabulary for grip and wood. Learners meet that bridge again in Chart 06.",
   give="Red grapes need long seasons and often irrigation. Learners pick one dry-farmed or water-wise red (old-vine Zinfandel, bush-vine Grenache) and share one fact a guest might remember. Each story can headline a Water to Wine pour.",
   hint="Clay headers, Deep Teal table header, Sand rows for Light, Mint Mist for Medium, Mauve-Grey tint for Bold."),
}

def md_table(rows):
    out = ["| " + " | ".join(COLS) + " |", "|" + "---|" * len(COLS)]
    for r in rows:
        out.append("| **" + r[0] + "** | " + " | ".join(r[1:]) + " |")
    return "\n".join(out)

def md_section(cid, s):
    return f"""## {cid} · {s['title']}
{NOTE}

**Purpose:** {s['purpose']}

### How to analyze a grape (Sip Studies nine steps)

```mermaid
{mermaid(s['kind'])}
```

{s['families']}

### Variety analysis table ({len(s['rows'])} varieties)

{md_table(s['rows'])}

*Place patterns are high-level teaching anchors, not a complete or official list. Learners confirm current regional rules from official sources.*

**What you practice**
""" + "\n".join("- " + p for p in s['practice']) + f"""

**Source vs Flow:** {s['sourceflow']}

**Bridge callout:** {s['bridge']}

**Give-Back:** {s['give']}

**Print hint:** {s['hint']}
"""

W = pathlib.Path("/workspace")
FAM_CLASS = {"Crisp":"f-a","Floral":"f-b","Rich":"f-c","Light":"f-a","Medium":"f-b","Bold":"f-c"}

def html_panel(cid, s):
    e = html.escape
    rows = []
    for r in s['rows']:
        cls = FAM_CLASS[r[1].split()[0]]
        cells = f'<th scope="row">{e(r[0])}</th><td><span class="fam {cls}">{e(r[1])}</span></td>' + "".join(f"<td>{e(c)}</td>" for c in r[2:])
        rows.append(f"<tr>{cells}</tr>")
    head = "".join(f'<th scope="col">{e(c)}</th>' for c in COLS)
    fam_text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", e(s['families']))
    fam_text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", fam_text)
    sf = re.sub(r"\*(.+?)\*", r"<em>\1</em>", e(s['sourceflow']))
    return f'''<section class="panel" id="chart-{cid}" data-id="{cid}">
  <h2>{cid} · {e(s['title'])}</h2>
  <p class="note">Original Sip Studies teaching. Public variety names. Not affiliated with any court, guild, or credentialing body.</p>
  <p class="purpose">{e(s['purpose'])}</p>
  <p class="families">{fam_text}</p>
  <h3 class="sub">Variety analysis table · {len(s['rows'])} varieties</h3>
  <div class="table-wrap"><table class="analysis">
    <thead><tr>{head}</tr></thead>
    <tbody>{"".join(rows)}</tbody>
  </table></div>
  <p class="fine">Place patterns are high-level teaching anchors, not a complete or official list.</p>
  <h3 class="sub">How to analyze a grape · Sip Studies nine steps</h3>
  <div class="mermaid-wrap"><pre class="mermaid">{e(mermaid(s['kind']))}</pre></div>
  <div class="meta">
    <div>
      <h3>What you practice</h3>
      <ul>{"".join(f"<li>{e(p)}</li>" for p in s['practice'])}</ul>
    </div>
    <div>
      <h3>Source vs Flow</h3>
      <p>{sf}</p>
      <p class="bridge"><strong>Bridge:</strong> {e(s['bridge'])}</p>
      <p class="give"><strong>Give-Back:</strong> {e(s['give'])}</p>
    </div>
  </div>
</section>'''

CSS = """  .note { margin: 0 0 0.5rem; font-size: 0.8rem; color: var(--teal); background: var(--mint); display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; }
  .families { font-size: 0.9rem; margin: 0 0 1rem; }
  h3.sub { color: var(--teal); font-size: 1.05rem; margin: 1.25rem 0 0.5rem; }
  .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid #e5ddd0; }
  table.analysis { border-collapse: collapse; width: 100%; min-width: 980px; font-size: 0.84rem; }
  table.analysis thead th { background: var(--teal); color: white; text-align: left; padding: 0.55rem 0.6rem; position: sticky; top: 0; font-weight: 600; }
  table.analysis td, table.analysis tbody th { padding: 0.5rem 0.6rem; border-top: 1px solid #eee4d6; vertical-align: top; text-align: left; }
  table.analysis tbody th { color: var(--clay); white-space: nowrap; }
  table.analysis tbody tr:nth-child(even) { background: var(--paper); }
  table.analysis td:last-child { background: rgba(237,212,168,0.35); }
  .fam { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.78rem; white-space: nowrap; }
  .fam.f-a { background: var(--mint); color: var(--teal); }
  .fam.f-b { background: #e7e3ea; color: #4d4652; }
  .fam.f-c { background: var(--clay); color: white; }
  .fine { font-size: 0.78rem; color: var(--mauve); margin: 0.4rem 0 0; }
"""

def splice_md(path):
    t = path.read_text()
    for cid, s in SPEC.items():
        pat = re.compile(rf"## {cid} · .*?(?=\n---\n)", re.S)
        assert pat.search(t), (path, cid)
        t = pat.sub(lambda m: md_section(cid, s).rstrip("\n") + "\n", t, count=1)
    t = t.replace("| 02 | Meeting White Grapes | W (bridge callout: S) |", "| 02 | White Grape Varieties — Species Analysis | W (bridge callout: S) |")
    t = t.replace("| 03 | Meeting Red Grapes | W (bridge callout: S) |", "| 03 | Red Grape Varieties — Species Analysis | W (bridge callout: S) |")
    path.write_text(t)

def main():
    for d in [W/"sip-studies-experience-charts", W/"Sip-Stack/experience-charts"]:
        for cid, s in SPEC.items():
            (d/s['file']).write_text("*Sip Studios › Ai Edu · Water to Wine*\n\n" + md_section(cid, s))
    for p in [W/"sip-studies-experience-charts-wbs.md", W/"Sip-Stack/sip-studies-experience-charts-wbs.md"]:
        splice_md(p)
    hp = W/"Sip-Stack/docs/index.html"
    h = hp.read_text()
    for cid, s in SPEC.items():
        pat = re.compile(rf'<section class="panel( active)?" id="chart-{cid}".*?</section>', re.S)
        assert pat.search(h), cid
        h = pat.sub(lambda m: html_panel(cid, s).replace('class="panel"', 'class="panel' + (m.group(1) or '') + '"', 1), h, count=1)
        h = re.sub(rf'(data-id="{cid}" aria-pressed="(?:true|false)">){cid} · [^<]*(</button>)',
                   lambda m: m.group(1) + f"{cid} · " + ("White Grape Varieties" if cid=="02" else "Red Grape Varieties") + m.group(2), h)
    if ".table-wrap" not in h:
        h = h.replace("</style>", CSS + "</style>", 1)
    hp.write_text(h)

if __name__ == "__main__":
    main()
