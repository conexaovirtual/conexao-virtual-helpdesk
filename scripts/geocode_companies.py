#!/usr/bin/env python3
"""Geocodifica empresas sem GPS. Estrategia para o Brasil:
CEP -> ViaCEP (nome correto da rua/bairro) -> Nominatim. Fallback: busca livre.
Rejeita o CENTROIDE de Goiania (Nominatim devolve isso quando nao acha o endereco)."""
import json, re, time, urllib.parse, urllib.request

COMPANIES = [
 ("5d9ac960-b13e-4bd8-a2bb-618de8ffb7f7","ALMOXARYFE FABRICA","C139, 1364, QD315 LT14, JARDIM AMERICA, GOIANIA/GO, CEP: 74275070"),
 ("60fccc87-d337-4ac5-b1fb-526327c3dbf6","BELOGROUP","94, 1027, QUADRAF-19 LOTE 127, SET SUL, GOIANIA/GO, CEP: 74083060"),
 ("6c5b886c-beb6-4cdc-b074-419e803b9a2e","BELOMOTORS CALDAS NOVAS","94, 1027, QUADRAF-19 LOTE 127, SET SUL, GOIANIA/GO, CEP: 74083060"),
 ("176535f2-2879-413a-a610-c3c7597eae71","BIG LOJA 85","AV. 85 SETOR SUL"),
 ("87364213-66fd-4d27-a834-25298d225d6b","CASA RENATA 136","Av. Jamel Cecilio"),
 ("d769a3cd-0f2e-41f2-8d26-270bfc29d581","CASA RENATA 85","Av. 85 setor sul"),
 ("b79e5dd1-8d9d-4f8b-821a-580c1a6a199d","CASA RENATA DEPOSITO CAMPINAS","Rua Jaragua campinas"),
 ("57df6a97-583a-4fe9-96ef-603375c44620","CASA RENATA RUA 6 CENTRO","6, 314, QUADRA52 LOTE 34E, SET CENTRAL, GOIANIA/GO, CEP: 74023030"),
 ("ddaa70cb-8cbf-426e-8027-647a21509539","CASA RENATA TAMANDARE","ASSIS CHATEAUBRIAND, 432, QUADRAB5 LOTE 13, SETOR OESTE, GOIANIA/GO, CEP: 74130010"),
 ("3dbbb4ea-44d8-49ad-bdc9-e1951361601a","ESCRITORIO NOVA ERA","Av. Minas gerais, Campinas Goiania-Goias"),
 ("28710adc-0827-416d-afa5-ffd5fb11cb7e","ESTAMPARIA FABRICA LENISMAR","SAO PAULO, 578, QUADRA80 LOTE 09 SALA 08, SET CAMPINAS, GOIANIA/GO, CEP: 74510030"),
 ("9e1f456f-4602-493f-bd99-9db8dc81b564","EVA FASHION FABRICA","BERNARDO SAYAO, 1556, QUADRAC LOTE 25 LOJA 11, SETOR MARECHAL RONDON, GOIANIA/GO, CEP: 74560070"),
 ("8028fc4d-0028-430a-8a13-c5cc2718d555","EVA FASHION LOJA","Av. Bernardo Sayao Setor Centro Oeste"),
 ("89ed7429-9d74-4496-9b27-aedc4c3618d9","EVERLEST MALHAS","MINAS GERAIS, 313, QUADRA78 LOTE 01, SETOR CAMPINAS, GOIANIA/GO, CEP: 74510040"),
 ("82c76f55-1e26-414f-88f7-2e52da6f4bdd","Hiper Popular Drogarias","Avenida Sao Luiz, 318, Moinho dos Ventos, GOIANIA/GO, CEP: 74371440"),
 ("7e419a79-459c-4d44-92e1-a1521f4c2d22","HIT AVIAMENTOS","MINAS GERAIS, 391, QUADRA78 LOTE 9, SET CAMPINAS, GOIANIA/GO, CEP: 74510040"),
 ("9394e13f-eac7-4807-adcb-bd556cdf8803","MIX AVIAMENTOS","MINAS GERAIS, 393, QUADRA78 LOTE 09, SETOR CAMPINAS, GOIANIA/GO, CEP: 74510040"),
 ("c7bf36b9-9b14-4942-8c43-93fea3185897","PRINCESINHA MALHAS","MINAS GERAIS, 343, QD.78 LT.12, SETOR CAMPINAS, GOIANIA/GO, CEP: 74510040"),
 ("28bcd7ac-2db7-465a-85d2-3030eb568e72","RE ESTAMPARIA","PARANA, 602, QUADRA108 LOTE 4, SETOR CAMPINAS, GOIANIA/GO, CEP: 74513010"),
 ("f2c350c9-bb03-4769-bf75-f5d8766a84e2","ROMA DISTRIBUICAO","211, 678, QUADRA98 LOTE 81 SALA 01, SETOR COIMBRA, GOIANIA/GO, CEP: 74530080"),
 ("e6be0f79-0d65-43e3-bb57-5876e039943c","RR ESTAMPARIA DIGITAL","RIO GRANDE DO SUL, 429, QUADRA27 LOTE 08, SETOR CAMPINAS, GOIANIA/GO, CEP: 74520070"),
 ("1aecd9c8-dd78-4e58-82ae-e1990a5d2307","SUPERMERCADO ARROBA","BERLIM, 250, PARQUE JOAO BRAZ, GOIANIA/GO, CEP: 74483110"),
 ("7a88dd59-0de1-48f8-a27d-2f0486b1095c","SUPERMERCADO HIPER CRISTAL","VEREDA DOS BURITIS, 262, RES VEREDA DOS BURITIS, GOIANIA/GO, CEP: 74370881"),
 ("f33c665f-4fd9-42c3-a95d-57d81291af8a","SV MALHAS E TECIDOS","ADEMAR FERRUGEM, 677, SET CAMPINAS, GOIANIA/GO, CEP: 74513020"),
 ("3a989fe9-fbe9-4087-af52-dc84cad48360","TECIDOS BORGES","JARAGUA, 684, CAMPINAS, GOIANIA/GO, CEP: 74515040"),
 ("38baf971-a515-45bf-b8ae-6b32d70f0f6a","TOP AVIAMENTOS","MINAS GERAIS, 335, QUADRA78 LOTE 12, SETOR CAMPINAS, GOIANIA/GO, CEP: 74510040"),
 ("366eae18-c114-4711-9736-7c8d15fd0a4a","XZ MODAS FABRICA","DO TRABALHO, 487, BRO RODOVIARIO, GOIANIA/GO, CEP: 74430450"),
 ("013d9515-b3a1-45f7-84f6-69cb244aebad","XZ MODAS FAMA","I, 60, SETOR CENTRO OESTE, GOIANIA/GO, CEP: 74550085"),
 ("489622dc-cdef-466e-9071-59c3dd4d5d8b","XZ MODAS GCM","DOUTOR JOAO ALVES DE CASTRO, 144, SET CRIMEIA OESTE, GOIANIA/GO, CEP: 74563170"),
]

LAT_MIN, LAT_MAX = -16.90, -16.45
LON_MIN, LON_MAX = -49.50, -49.10
CENTROID = (-16.6809, -49.2533)  # Nominatim devolve isso quando falha -> rejeitar
UA = "conexao-virtual-helpdesk-geocoder/1.0 (josepereira@conexaovirtual.in)"

def in_goiania(lat, lon):
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX

def is_centroid(lat, lon):
    return abs(lat - CENTROID[0]) < 0.0015 and abs(lon - CENTROID[1]) < 0.0015

def get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

def viacep(cep):
    try:
        d = get_json(f"https://viacep.com.br/ws/{cep}/json/")
        if d.get("erro"): return None
        return d  # logradouro, bairro, localidade, uf
    except Exception:
        return None

def nominatim_q(q):
    qs = urllib.parse.urlencode({"q": q, "format":"json","limit":"1","countrycodes":"br"})
    try:
        d = get_json("https://nominatim.openstreetmap.org/search?"+qs, {"User-Agent": UA})
    except Exception:
        d = None
    time.sleep(1.1)
    if not d: return None
    lat, lon = float(d[0]["lat"]), float(d[0]["lon"])
    if not in_goiania(lat, lon) or is_centroid(lat, lon): return None
    return lat, lon, d[0].get("display_name","")

def num_from(end):
    m = re.search(r",\s*(\d{1,5})\s*,", end)  # 2o token costuma ser o numero
    return m.group(1) if m else ""

def geocode(nome, end):
    m = re.search(r"(\d{5})[-\s]?(\d{3})", end)
    cep = (m.group(1)+m.group(2)) if m else None
    num = num_from(end)
    # 1) CEP -> ViaCEP -> rua certa -> Nominatim (com e sem numero)
    if cep:
        vc = viacep(cep)
        if vc and vc.get("logradouro"):
            base = f"{vc['logradouro']}, {vc.get('bairro','')}, {vc['localidade']}, {vc['uf']}, Brasil"
            if num:
                r = nominatim_q(f"{vc['logradouro']}, {num}, {vc.get('bairro','')}, {vc['localidade']}, {vc['uf']}, Brasil")
                if r: return ("viacep+num", *r)
            r = nominatim_q(base)
            if r: return ("viacep", *r)
    # 2) Busca livre (limpa quadra/lote/cep)
    livre = re.sub(r"CEP:?\s*\d{5}[-\s]?\d{3}", "", end, flags=re.I)
    livre = re.sub(r"\b(QD|QUADRA|LT|LOTE|SALA|LOJA|EDIF)\S*", "", livre, flags=re.I)
    livre = re.sub(r"\s{2,}", " ", livre).strip(" ,")
    if "goiania" not in livre.lower(): livre += ", Goiania, GO"
    livre += ", Brasil"
    r = nominatim_q(livre)
    if r: return ("livre", *r)
    return (None, None, None, None)

out = []
for cid, nome, end in COMPANIES:
    strat, lat, lon, disp = geocode(nome, end)
    out.append({"id":cid,"nome":nome,"lat":lat,"lon":lon,"strategy":strat,"display":disp})
    print(f"{'OK ' if lat else 'FALHOU'} {nome}: {lat},{lon} [{strat}] {(disp or '')[:65]}", flush=True)

with open("/tmp/geocode_result.json","w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
ok = sum(1 for o in out if o["lat"])
print(f"\n=== {ok}/{len(out)} geocodificados (centroide rejeitado) -> /tmp/geocode_result.json ===")
