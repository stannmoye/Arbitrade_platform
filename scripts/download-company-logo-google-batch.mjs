#!/usr/bin/env node
/**
 * Download company site icons for a configurable catalogue range.
 * Only uses explicitly mapped official homepages. No image-search scraping.
 * Prefers logo-like SVG/PNG and Apple touch icons, then declared favicon, then /favicon.ico.
 * Existing catalogue records and filenames are preserved; only successful icon downloads update metadata.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE = join(ROOT, "server/data/company-catalogue-1000.json");
const LOGO_DIR = join(ROOT, "client/public/assets/company-logos");
const BATCH_SIZE = 200;
const batch = Number(process.env.LOGO_BATCH ?? process.argv[2] ?? 1);
const MAX_BYTES = 150 * 1024;
const USER_AGENT = "ArbitradeCompanyLogoFetcher/1.2 (+official-site favicon extraction)";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

if (!Number.isInteger(batch) || batch < 1 || batch > 5) throw new Error("LOGO_BATCH must be between 1 and 5.");

// Domains below were identified as the companies' own sites. Do not add ambiguous domains
// without confirming the company identity first; unknown entries stay pending, not guessed.
const OFFICIAL_SITES = {
  "us-aardvark-therapeutics-inc-common-stock-aard-15e6f085": "https://aardvarktherapeutics.com/",
  "us-aar-corp-air-e9326ec4": "https://www.aarcorp.com/",
  "tw-1-production-film-co-8458-e542baaf": "https://www.1production.com.tw/",
  "pl-answear-com-s-a-anr-8aa7d910": "https://about.answear.com/",
  "pl-alior-bank-s-a-alr-1b196cab": "https://www.aliorbank.pl/",
  "pl-7levels-sa-7lv-c6a535e5": "https://www.7lvls.com/",
  "jp-3-d-matrix-ltd-7777-5d23fe3d": "https://www.3dmatrix.com/",
  "jp-a-tie-co-ltd-369a-4dee7904": "https://a-tie.co.jp/",
  "jp-abc-co-ltd-8783-895af577": "https://abc-chain.com/",
  "jp-4cs-hd-co-ltd-3726-68a12118": "https://www.4cs-holdings.co.jp/en/",
  "jp-a-a-material-corporation-5391-1744979d": "https://aa-material.co.jp/eng/company/",
  "jp-a-d-holon-holdings-company-limited-7745-4ccde400": "https://andholon.com/en/",
  "jp-a-d-works-group-co-ltd-2982-4f2880a9": "https://www.adwg.co.jp/en/",
  "jp-ab-company-co-ltd-9251-efc7382d": "https://www.ab-company.co.jp/",
  "jp-abalance-corporation-3856-f6f28473": "https://www2.abalance.jp/aboutus/abalance/",
  "jp-abc-mart-inc-2670-9f4a83d0": "https://www.abc-mart.co.jp/",
  "jp-abeja-inc-5574-08b3a823": "https://www.abejainc.com/en/company",
  "jp-abist-co-ltd-6087-8dccda2c": "https://www.abist.co.jp/en/",
  "jp-accelia-inc-271a-383135f9": "https://www.accelia.jp/",
  "jp-access-co-ltd-4813-be1a8936": "https://www.access-company.com/",
  "in-20-microns-ltd-20microns-919ac70f": "https://www.20microns.com/",
  "in-360-one-wam-ltd-360one-09490cef": "https://www.360.one/",
  "in-3b-blackbio-dx-ltd-3bblackbio-efd20dbc": "https://3bblackbio.com/",
  "in-3b-films-ltd-3bfilms-151d41dc": "https://www.3bfilms.com/",
  "in-3c-it-solutions-and-telecoms-india-ltd-3cit-09074294": "https://www.3citsolutions.com/",
  "in-3i-infotech-ltd-3iinfoltd-19baaa74": "https://www.3i-infotech.com/",
  "in-3m-india-ltd-3mindia-18db5b55": "https://www.3mindia.com/",
  "in-3p-land-holdings-ltd-3pland-ff24b660": "https://3pland.com/",
  "in-5paisa-capital-ltd-5paisa-14e4e6c8": "https://www.5paisa.com/",
  "in-63-moons-technologies-ltd-63moons-7cf68307": "https://www.63moons.com/",
  "in-7nr-retail-ltd-7nr-d7db40c3": "https://www.7nrretailltd.in/",
  "in-7seas-entertainment-ltd-7seasl-64cc2752": "https://www.7seasent.com/",
  "in-a-1-ltd-a1l-b0c5f2be": "https://www.a-1limited.com/",
  "in-a-b-cotspin-india-ltd-abcots-fce5bd8e": "https://abcotspin.co.in/",
  "fr-2crsi-s-a-al2si-a114086a": "https://www.2crsi.com/",
  "fr-74software-74sw-8443116c": "https://www.74software.com/",
  "fr-ab-science-s-a-ab-af4b7c3d": "https://www.ab-science.com/",
  "fr-abc-arbitrage-sa-abca-7278b50d": "https://www.abc-arbitrage.com/",
  "fr-abeo-sa-0rjy-ca2e45d4": "https://www.abeo.eu/",
  "fr-abionyx-pharma-sa-abnx-75dc3ca3": "https://www.abionyx.com/",
  "fr-abivax-sa-abvx-2306718a": "https://www.abivax.com/",
  "fr-accor-s-a-ac-77967177": "https://group.accor.com/",
  "fr-acheter-louer-alalo-6d2044be": "https://www.acheter-louer.fr/",
  "fr-acteos-s-a-eos-7d241b1b": "https://www.acteos.com/",
  "fr-actia-group-alati-b2937f60": "https://www.actia.com/",
  "fr-activium-group-mlact-11a98f1e": "https://www.activium.fr/",
  "fr-ada-alada-a5c5146b": "https://www.ada.fr/",
  "fr-adeunis-alarf-371c17e8": "https://www.adeunis.com/",
  "it-a-b-p-nocivelli-s-p-a-abp-1849154d": "https://www.abpnocivelli.com/",
  "it-a2a-spa-0n54-c993524c": "https://www.gruppoa2a.it/",
  "it-acea-s-p-a-0mhd-941cd98d": "https://www.acea.it/",
  "it-acinque-ac5-7df02124": "https://www.acinque.it/",
  "it-alerion-clean-power-s-p-a-0p3o-55117d10": "https://www.alerion.it/",
  "it-alfio-bardolla-training-group-spa-abtg-8736bbe1": "https://www.alfiobardolla.com/",
  "it-alfonsino-s-p-a-alfo-42c4c503": "https://www.alfonsino.it/",
  "it-almawave-s-p-a-aiw-a0d4d0ec": "https://www.almawave.com/",
  "it-amplifon-s-p-a-0n61-49e67a71": "https://www.amplifon.com/",
  "it-anima-holding-s-p-a-0qti-bef30201": "https://www.animasgr.it/",
  "it-antares-vision-spa-antvf-ebd4a454": "https://www.antaresvisiongroup.com/",
  "it-aquafil-s-p-a-6w7-95f443e5": "https://www.aquafil.com/",
  "it-arnoldo-mondadori-editore-s-p-a-0kav-d81023b8": "https://www.mondadorigroup.com/",
  "it-arterra-bioscience-s-p-a-arbs-ed072fd6": "https://www.arterrabio.it/",
  "br-2w-ecobank-s-a-2wav3-56f8df71": "https://ri.2wecobank.com.br/",
  "br-524-participacoes-s-a-qvqp3-3cc4f4c9": "http://www.524participacoes.com.br/home/index.aspx",
  "br-acessopar-investimentos-e-participacoes-s-a-a6op3-c642b25e": "https://www.acessopar.com.br/",
  "br-aeris-ind-e-com-de-equip-geracao-de-energia-s-a-aeri3-e612f540": "https://www.aerisenergy.com.br/",
  "br-afluente-transmissao-de-energia-eletrica-s-a-aflt3-61f93a96": "https://www.afluente.com.br/",
  "br-agrale-s-a-agra4-6c93deb5": "https://www.agrale.com.br/",
  "br-agrogalaxy-participacoes-s-a-agxy3-914b0a41": "https://ri.agrogalaxy.com.br/",
  "br-alfa-holdings-s-a-rpad3-bd3f28cb": "https://www.alfaholdings.com.br/",
  "br-aliperti-s-a-apti3-a1df5d09": "https://www.aliperti.com.br/",
  "br-allianca-saude-e-participacoes-s-a-aalr12-9c802dd0": "https://www.allianca.com/",
  "br-allied-tecnologia-s-a-alld3-6e4fb88e": "https://www.alliedbrasil.com.br/",
  "br-allos-s-a-alos3-e9149122": "https://www.allos.co/",
  "br-allpark-empreendimentos-participacoes-servicos-s-a-alpk3-0c11b016": "https://www.estapar.com.br/",
  "br-alpargatas-s-a-alpa3-ca4df4cc": "https://www.alpargatas.com.br/",
  "mx-accel-s-a-b-de-c-v-accelsab-2456b531": "https://www.accel.com.mx/",
  "mx-alpek-s-a-b-de-c-v-alpeka-293f4000": "https://www.alpek.com/",
  "mx-alsea-s-a-b-de-c-v-alsea-3fa52f1d": "https://www.alsea.net/",
  "mx-alterna-asesoria-internacional-s-a-b-de-c-v-alternab-cbe9c163": "https://www.alterna.mx/",
  "mx-america-movil-sab-de-cv-amxb-15c0b7dc": "https://www.americamovil.com/",
  "mx-axtel-s-a-b-de-c-v-axtelcpo-2fda0d1a": "https://www.axtel.mx/",
  "id-abm-investama-tbk-abmm-c411ce36": "https://www.abm-investama.com/",
  "id-ace-oldfields-pt-kuas-32e01fb9": "https://www.aceoldfields.com/",
  "id-acset-indonusa-tbk-acst-5635cf6f": "https://www.acset.co/",
  "id-adaro-andalan-indonesia-tbk-aadi-cd26da86": "https://www.adaro.com/",
  "id-adaro-minerals-indonesia-tbk-pt-admr-dd3a7d7b": "https://adarominerals.id/",
  "id-adhi-commuter-properti-tbk-adcp-1e04524e": "https://www.adcp.co.id/",
  "id-adi-sarana-armada-tbk-assa-0d5c3792": "https://www.assa.id/",
  "id-adira-dinamika-multi-finance-admf-ad9b4c9d": "https://www.adira.co.id/",
  "id-adiwarna-anugerah-abadi-tbk-naik-e93e8fc8": "https://www.adiwarna.co.id/",
  "id-aesler-grup-internasional-tbk-pt-rony-e3456419": "https://aesler.co.id/",
  "id-agro-bahari-nusantara-tbk-udng-56d101a5": "https://www.agrobahari.com/",
  "id-agro-yasa-lestari-pt-tbk-ayls-23eedbb8": "https://www.agroyasalestari.com/",
  "id-agung-podomoro-land-tbk-apln-c4d313e0": "https://www.agungpodomoroland.com/",
  "id-akasha-wira-international-tbk-ades-94800369": "https://www.akashainternational.com/",
  "tr-1000-yatirimlar-holding-a-s-binho-d1705fc7": "https://1000.com.tr/",
  "tr-a-v-o-d-kurutulmus-gida-ve-tarim-urunleri-sanayi-ticaret-avod-7cb88434": "https://www.avod.com.tr/",
  "tr-a1-capital-yatirim-menkul-degerler-a-s-a1cap-8b7875c0": "https://www.a1capital.com.tr/",
  "tr-a1-yenilenebilir-enerji-uretim-a-s-a1yen-dac82f70": "https://www.a1yenilenebilir.com/",
  "tr-aciselsan-acipayam-seluloz-sanayi-ve-ticaret-a-s-acsel-6c1d8d3d": "https://www.aciselsan.com.tr/",
  "tr-adel-kalemcilik-ticaret-ve-sanayi-a-s-adel-94521adb": "https://www.adel.com.tr/",
  "tr-adese-gayrimenkul-yatirim-a-s-adese-4c39d6d0": "https://www.adese.com.tr/",
  "tr-adra-gayrimenkul-yatirim-ortakligi-a-s-adgyo-8b4b921c": "https://www.adragyo.com/",
  "tr-afyon-cimento-sanayi-t-a-s-afyon-1b28f234": "https://www.afyoncimento.com/",
  "tr-ag-anadolu-grubu-holding-a-s-aghol-9d1abc5a": "https://www.anadolugrubu.com.tr/",
  "tr-agaoglu-avrasya-gayrimenkul-yatirim-ortakligi-a-s-aagyo-8d3309f8": "https://www.agaoglu.com.tr/",
  "tr-agesa-hayat-ve-emeklilik-a-s-agesa-dd9cee1c": "https://www.agesa.com.tr/",
  "tr-agrotech-yuksek-teknoloji-ve-yatirim-a-s-agrot-9ea22874": "https://www.agrotech.com.tr/",
  "tr-ahes-gayrimenkul-yatirim-ortakligi-a-s-ahsgy-68e9e4ce": "https://www.ahesgyo.com/",
  "nl-a-h-t-syngas-technology-n-v-3sq1-3d3c16bf": "https://www.ahtsyngas.com/",
  "nl-aalberts-nv-aalb-6ece8df9": "https://aalberts.com/",
  "nl-abn-amro-bank-n-v-abn-1f661b18": "https://www.abnamro.com/",
  "nl-acomo-acomo-f116cf8f": "https://www.acomo.nl/",
  "nl-ad-pepper-media-international-n-v-apm-1d72bd14": "https://www.adpepper.com/",
  "nl-adyen-adyen-5857227d": "https://www.adyen.com/",
  "nl-adyen-nv-adyey-8d6d9d87": "https://www.adyen.com/",
  "nl-aegon-n-v-aegof-882704b2": "https://www.aegon.com/",
  "nl-aercap-holdings-nv-aer-c7b75ebd": "https://www.aercap.com/",
  "nl-affimed-n-v-0hl9-2ed37ebd": "https://www.affimed.com/",
  "nl-airbus-group-se-0kvv-3c287580": "https://www.airbus.com/",
  "nl-ajax-ajax-2f92e989": "https://english.ajax.nl/",
  "nl-akzo-nobel-akza-1c18f63c": "https://www.akzonobel.com/",
  "nl-alfen-alfen-a79749b6": "https://alfen.com/",
  "ch-ac-immune-ltd-aciu-ce9209a6": "https://www.acimmune.com/",
  "ch-accelleron-industries-ag-aclly-81d78077": "https://accelleron-industries.com/",
  "ch-adc-therapeutics-sa-adct-0bddde8b": "https://www.adctherapeutics.com/",
  "ch-addex-therapeutics-ltd-adxn-75f5aa03": "https://www.addextherapeutics.com/",
  "ch-adecco-group-ag-class-n-aden-ec13c265": "https://www.adeccogroup.com/",
  "ch-adval-tech-holding-ag-advn-95bfaf9c": "https://www.advaltech.com/",
  "ch-aebi-schmidt-holding-ag-common-stock-aebi-4a1cc09a": "https://www.aebi-schmidt.com/",
  "ch-aevis-victoria-sa-aevs-5050f450": "https://www.aevis.com/",
  "ch-afrika-gold-ag-gog-7f07ed86": "https://www.afrikagold.com/",
  "ch-allreal-holding-alln-311649cf": "https://www.allreal.ch/",
  "ch-allwyn-ag-gofpy-1609c3ad": "https://www.allwyn.com/",
  "ch-alpine-select-ag-alpn-32087977": "https://www.alpine-select.ch/",
  "pl-11-bit-studios-s-a-11b-621e48d6": "https://11bitstudios.com/",
  "pl-3r-games-sa-3rg-512b92b2": "https://3rgames.pl/",
  "pl-4mass-sa-4ms-6bdcee1c": "https://4mass.pl/",
  "pl-4mobility-sa-4mb-4da3c19e": "https://4mobility.pl/",
  "us-abbott-laboratories-abt-28547a7e": "https://www.abbott.com/",
  "us-abercrombie-fitch-company-anf-4171b3d6": "https://corporate.abercrombie.com/",
  "us-abm-industries-incorporated-abm-dd8eae77": "https://www.abm.com/",
  "us-acacia-research-corporation-actg-d789c000": "https://www.acaciaresearch.com/",
  "us-acadia-healthcare-company-inc-achc-6059c720": "https://www.acadiahealthcare.com/",
  "us-acadia-pharmaceuticals-inc-acad-032946ee": "https://www.acadia-pharm.com/",
  "gb-a-g-barr-plc-bag-f8fa3069": "https://www.agbarr.co.uk/",
  "gb-ab-dynamics-abdp-70cfb048": "https://www.abdynamics.com/",
  "gb-aberdeen-group-plc-abdn-4cc056ea": "https://www.aberdeenplc.com/",
  "gb-airtel-africa-plc-aaf-4bc3c714": "https://airtel.africa/",
  "gb-aj-bell-plc-ajb-4d022fff": "https://www.ajbell.co.uk/",
  "gb-anglo-american-plc-aaukd-3e8b6788": "https://www.angloamerican.com/",
  "de-adidas-ag-na-o-n-ads-6d992da1": "https://www.adidas-group.com/",
  "de-allianz-se-alizf-d09abf9d": "https://www.allianz.com/",
  "au-29metals-limited-29m-ac961427": "https://www.29metals.com/",
  "au-3p-learning-limited-73p-800fa620": "https://www.3plearning.com/",
  "au-abacus-storage-king-ask-72bdc3b3": "https://www.abacusproperty.com.au/",
  "au-accent-group-limited-ax1-7110bd82": "https://www.accentgr.com.au/",
  "au-adairs-limited-adh-7e04efb0": "https://www.adairs.com.au/",
  "au-adore-beauty-group-limited-aby-c501414b": "https://www.adorebeautygroup.com.au/",
  "cn-air-china-ltd-class-a-601111-dc556ef8": "https://www.airchina.com.cn/en/",
  "cn-agricultural-bank-of-china-ltd-class-a-601288-a3bb0622": "https://www.abchina.com/en/",
  "cn-all-winner-technology-co-ltd-300458-462bf53b": "https://www.allwinnertech.com/",
  "cn-angang-steel-co-ltd-class-a-000898-b2f795ce": "https://www.ansteel.cn/",
  "cn-aluminum-corp-of-china-ltd-601600-9755a197": "https://www.chalco.com.cn/",
  "us-aboitiz-equity-ventures-inc-adr-abtzy-71c56af6": "https://aboitiz.com/",
  "us-aboitiz-power-corp-adr-abzpy-e58ac401": "https://aboitizpower.com/",
  "us-absa-group-ltd-adr-agrpy-67828cb6": "https://www.absa.africa/",
  "us-absci-corp-absi-9d3ef961": "https://www.absci.com/",
  "us-academy-sports-outdoors-inc-aso-f52a5b71": "https://www.academy.com/",
  "us-acadia-realty-trust-akr-d67ed0ea": "https://www.acadiarealty.com/",
  "us-acadian-asset-management-inc-aami-521dedc4": "https://www.acadian-asset.com/",
  "gb-1spatial-plc-spa-1247afe0": "https://1spatial.com/",
  "gb-4basebio-uk-societas-4bb-c2b8f7ee": "https://4basebio.com/",
  "gb-4global-plc-4gbl-71b9edd3": "https://4global.com/",
  "gb-80-mile-plc-80m-b5397543": "https://80mileplc.com/",
  "gb-aberdeen-diversified-income-and-growth-trust-plc-adig-341b0e26": "https://www.aberdeeninvestments.com/adig",
  "gb-aberdeen-new-india-investment-trust-plc-anii-f6a39f00": "https://www.aberdeeninvestments.com/ani",
  "gb-aberforth-geared-value-agvi-9e3b2b6f": "https://www.aberforth.co.uk/trusts-and-funds/aberforth-geared-value-income-trust-plc/general-information",
  "gb-aberforth-geared-value-income-trust-plc-agzi-5b7f9e9c": "https://www.aberforth.co.uk/trusts-and-funds/aberforth-geared-value-income-trust-plc/general-information",
  "gb-aberforth-smaller-companies-trust-plc-asl-2d993cab": "https://www.aberforth.co.uk/trusts-and-funds/aberforth-smaller-companies-trust-plc/general-information",
  "gb-abingdon-health-plc-abdx-6bbcfc65": "https://www.abingdonhealth.com/",
  "gb-abrdn-asia-focus-plc-aas-498f7263": "https://www.aberdeeninvestments.com/aas",
  "gb-abrdn-asian-income-fund-limited-aaif-827131d4": "https://www.aberdeeninvestments.com/aaif",
  "gb-abrdn-european-logistics-income-plc-asli-8778d207": "https://www.aberdeeninvestments.com/asli",
  "gb-abrdn-uk-smaller-companies-growth-trust-plc-ausc-6213d630": "https://www.aberdeeninvestments.com/ausc",
  "gb-accesso-technology-group-plc-acso-d10cecd2": "https://accesso.com/",
  "gb-adnams-plc-adb-62507434": "https://www.adnams.co.uk/",
  "gb-aew-uk-reit-plc-aewu-c10aa070": "https://www.aewukreit.com/",
  "gb-afc-energy-plc-afc-c3322f4f": "https://www.afcenergy.com/",
  "gb-afentra-plc-aet-2fe9e5bb": "https://www.afentra.com/",
  "gb-aferian-plc-afrn-4c5120f4": "https://aferian.com/",
  "gb-airea-plc-aiea-339323c0": "https://www.aireaplc.com/",
  "gb-albion-enterprise-vct-plc-aaev-f6e1caf0": "https://www.albion.capital/",
  "gb-albion-technology-general-vct-plc-aatg-8937459e": "https://www.albion.capital/",
  "gb-alfa-financial-software-holdings-plc-alfa-634594ae": "https://www.alfasystems.com/",
  "gb-allergy-therapeutics-agy-bff3962d": "https://www.allergytherapeutics.com/",
  "gb-allfunds-group-plc-0aal-d7b9e1dd": "https://www.allfunds.com/",
  "gb-alliance-witan-ord-alw-91a25fce": "https://www.alliancewitan.com/",
  "gb-allianz-technology-trust-plc-att-9deb21d9": "https://www.allianztechnologytrust.com/",
  "gb-alpha-growth-plc-alpgf-9a66de62": "https://alphagrowthplc.com/",
  "us-ab-ignitis-grupe-ign-e60fa2cc": "https://ignitisgrupe.lt/en/companies/ab-ignitis-grupe",
  "us-ab-international-group-corp-abqq-515c211c": "https://www.abqqs.com/",
  "us-abeona-therapeutics-inc-0h7r-81994abb": "https://www.abeonatherapeutics.com/",
  "us-abundia-global-impact-group-inc-common-stock-agig-f2bbf916": "https://abundiaimpact.com/",
  "us-abvc-biopharma-inc-abvc-43785614": "https://abvcbiopharma.com/",
  "gb-acuity-rm-group-plc-acrm-10a404c3": "https://acuityrmgroup.com/",
  "gb-adalan-ventures-plc-zaim-93232986": "https://adalanventures.com/",
};

function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function extensionFor(type, url) {
  const mime = String(type || "").split(";")[0].trim().toLowerCase();
  if (mime === "image/svg+xml") return ".svg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon" || mime === "image/ico") return ".ico";
  const suffix = extname(new URL(url).pathname).toLowerCase();
  return [".svg", ".png", ".webp", ".jpg", ".jpeg", ".ico"].includes(suffix) ? (suffix === ".jpeg" ? ".jpg" : suffix) : null;
}
async function get(url, headers = {}, timeout = 18000) {
  return fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,image/svg+xml,image/png,image/webp,image/x-icon,*/*;q=0.7", ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: "follow"
  });
}
function extractIconCandidates(html, homepage) {
  const found = [];
  const seen = new Set();
  const add = (raw, priority, kind) => {
    if (!raw) return;
    const cleaned = decodeHtml(raw.trim().replace(/^['"]|['"]$/g, ""));
    if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("javascript:")) return;
    let url;
    try { url = new URL(cleaned, homepage).href; } catch { return; }
    if (!/^https?:$/i.test(new URL(url).protocol) || seen.has(url)) return;
    seen.add(url);
    found.push({ url, priority, kind });
  };
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const rawTag = tag[0];
    const rel = ((rawTag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || "").toLowerCase();
    const href = (rawTag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    if (/apple-touch-icon|apple-touch-icon-precomposed/.test(rel)) add(href, 0, "apple-touch-icon");
    else if (/icon/.test(rel) && /svg/i.test(href + " " + rawTag)) add(href, 1, "declared-svg-icon");
    else if (/icon/.test(rel)) add(href, 2, "declared-favicon");
  }
  // Some sites publish SVG logos as image elements; only accept an image explicitly labelled logo.
  for (const tag of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const rawTag = tag[0];
    const label = ((rawTag.match(/\b(?:alt|title|class|id)\s*=\s*["']([^"']+)["']/i) || [])[1] || "").toLowerCase();
    const src = (rawTag.match(/\b(?:src|srcset)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (src && /logo|brand-mark|brandmark|site-icon/.test(label)) add(src.split(",")[0].trim().split(/\s+/)[0], 1, "logo-labelled-image");
  }
  found.sort((a, b) => a.priority - b.priority);
  const origin = new URL(homepage).origin;
  add(new URL("/favicon.ico", origin).href, 3, "standard-favicon");
  return found;
}
async function downloadIcon(candidate) {
  try {
    const response = await get(candidate.url, {}, 15000);
    if (!response.ok) return null;
    const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/") && !/\.ico(?:$|\?)/i.test(response.url)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100 || bytes.length > MAX_BYTES) return null;
    const ext = extensionFor(mime, response.url || candidate.url);
    if (!ext) return null;
    if (ext === ".svg") {
      const svg = bytes.toString("utf8");
      if (!/<svg[\s>]/i.test(svg) || /<script\b|<foreignObject\b/i.test(svg)) return null;
    }
    // Reject HTML error pages served with a misleading image content type.
    if (bytes.subarray(0, 100).toString("utf8").toLowerCase().includes("<!doctype html")) return null;
    return { bytes, ext, sourceUrl: response.url || candidate.url, mime, sha256: sha256(bytes), iconKind: candidate.kind };
  } catch { return null; }
}

const catalogue = JSON.parse(await readFile(CATALOGUE, "utf8"));
if (!Array.isArray(catalogue.companies) || catalogue.companies.length !== 1000) {
  throw new Error("Expected the existing 1,000-company catalogue; refusing to rebuild it.");
}
const requestedStart = Number(process.env.LOGO_START ?? ((batch - 1) * BATCH_SIZE + 1));
const requestedCount = Number(process.env.LOGO_COUNT ?? BATCH_SIZE);
if (!Number.isInteger(requestedStart) || requestedStart < 1 || requestedStart > catalogue.companies.length) throw new Error("LOGO_START must be a valid 1-based catalogue position.");
if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedStart + requestedCount - 1 > catalogue.companies.length) throw new Error("LOGO_COUNT must fit within the 1,000-record catalogue.");
const start = requestedStart - 1;
const companies = catalogue.companies.slice(start, start + requestedCount);
if (companies.length !== requestedCount) throw new Error("Requested range does not contain the requested number of records.");
await mkdir(LOGO_DIR, { recursive: true });

let downloaded = 0;
let alreadyReal = 0;
let failed = 0;
let unverifiedSite = 0;
const report = [];

for (let i = 0; i < companies.length; i++) {
  const company = companies[i];
  const officialHomepage = OFFICIAL_SITES[company.id];
  if (!String(company.logoSourceName || "").toLowerCase().includes("placeholder")) {
    alreadyReal++;
    report.push({ id: company.id, name: company.name, status: "already-real", homepage: officialHomepage || null });
    continue;
  }
  if (!officialHomepage) {
    unverifiedSite++;
    report.push({ id: company.id, name: company.name, status: "official-site-not-verified", note: "No confirmed official homepage mapping; left existing asset unchanged." });
    console.warn("No verified official site for " + company.name + "; leaving placeholder unchanged.");
    continue;
  }
  let homepageResponse;
  try {
    homepageResponse = await get(officialHomepage, { accept: "text/html,application/xhtml+xml" }, 22000);
    if (!homepageResponse.ok) throw new Error("HTTP " + homepageResponse.status);
    const contentType = (homepageResponse.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("Homepage did not return HTML");
  } catch (error) {
    failed++;
    report.push({ id: company.id, name: company.name, status: "official-site-fetch-failed", homepage: officialHomepage, error: error.message });
    console.warn("Official site unavailable for " + company.name + ": " + error.message);
    continue;
  }
  const finalHomepage = homepageResponse.url || officialHomepage;
  const html = await homepageResponse.text();
  const candidates = extractIconCandidates(html, finalHomepage);
  let asset = null;
  for (const candidate of candidates.slice(0, 12)) {
    asset = await downloadIcon(candidate);
    if (asset) break;
  }
  if (!asset) {
    failed++;
    report.push({ id: company.id, name: company.name, status: "no-usable-site-icon", homepage: finalHomepage, candidatesChecked: Math.min(candidates.length, 12) });
    console.warn("No usable icon from official site for " + company.name);
    await sleep(250);
    continue;
  }
  const publicPath = String(company.logoUrl || "").replace(/^\//, "");
  const oldFullPath = join(ROOT, "client/public", publicPath);
  const newPublicPath = publicPath.replace(/\.[^.]+$/, "") + asset.ext;
  const fullPath = join(ROOT, "client/public", newPublicPath);
  await writeFile(fullPath, asset.bytes);
  if (oldFullPath !== fullPath) await rm(oldFullPath, { force: true });
  company.logoUrl = "/" + newPublicPath;
  company.logoSourceName = "Official company website " + asset.iconKind;
  company.logoSourceUrl = asset.sourceUrl;
  company.logoSourceSlug = "official-website-favicon";
  company.logoHomepageUrl = finalHomepage;
  company.logoMimeType = asset.mime;
  company.logoBytes = asset.bytes.length;
  company.logoSha256 = asset.sha256;
  company.logoRetrievedAt = new Date().toISOString();
  company.logoSearchProvider = "Official company website favicon extraction";
  downloaded++;
  report.push({
    id: company.id, name: company.name, status: "official-site-icon-downloaded",
    homepage: finalHomepage, iconKind: asset.iconKind, source: asset.sourceUrl,
    bytes: asset.bytes.length, mime: asset.mime, sha256: asset.sha256
  });
  console.log("Saved official-site icon " + (start + i + 1) + "/1000 " + company.name + " (" + asset.bytes.length + " bytes)");
  await sleep(250);
}

catalogue.logoBatchDownload = {
  provider: "Official company websites: declared logo/favicon/apple-touch-icon extraction",
  batch,
  range: [start + 1, start + companies.length],
  attemptedAt: new Date().toISOString(),
  downloaded,
  alreadyReal,
  failed,
  unverifiedSite,
  note: "Only icons fetched from an explicitly mapped official homepage are accepted. Unverified sites and failed icons remain pending; catalogue records are not regenerated."
};
await writeFile(CATALOGUE, JSON.stringify(catalogue, null, 2) + "\n");
const reportName = process.env.LOGO_START || process.env.LOGO_COUNT
  ? "company-logo-range-" + String(start + 1).padStart(3, "0") + "-" + String(start + companies.length).padStart(3, "0") + "-report.json"
  : "company-logo-batch-" + String(batch).padStart(2, "0") + "-report.json";
await writeFile(join(ROOT, "server/data", reportName), JSON.stringify({ ...catalogue.logoBatchDownload, results: report }, null, 2) + "\n");
console.log(JSON.stringify(catalogue.logoBatchDownload, null, 2));
if (downloaded === 0 && alreadyReal === 0) process.exitCode = 1;
