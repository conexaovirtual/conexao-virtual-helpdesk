// Geocodifica o endereço de uma empresa para latitude/longitude.
//
// IMPORTANTE: a localização da empresa deve vir SEMPRE do endereço, nunca do
// GPS do dispositivo de quem está cadastrando (isso contaminava o cadastro com
// a posição do técnico). Ver também a trava no banco (set_company_location).
//
// Estratégia: extrai o CEP do endereço e consulta a AwesomeAPI (precisão de
// rua/quadra no Brasil). Se não houver CEP, cai para busca textual no Nominatim.

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  fonte: 'cep' | 'endereco';
}

/** Extrai um CEP (8 dígitos) de um texto de endereço, se houver. */
function extrairCep(endereco: string): string | null {
  const match = endereco.match(/(\d{5})-?\s?(\d{3})/);
  if (!match) return null;
  return `${match[1]}${match[2]}`;
}

async function geocodePorCep(cep: string): Promise<GeocodeResult | null> {
  try {
    const resp = await fetch(`https://cep.awesomeapi.com.br/json/${cep}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const lat = parseFloat(data?.lat);
    const lng = parseFloat(data?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng, fonte: 'cep' };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodePorTexto(endereco: string): Promise<GeocodeResult | null> {
  try {
    const q = encodeURIComponent(endereco);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=br`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return null;
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng, fonte: 'endereco' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Geocodifica um endereço. Tenta primeiro pelo CEP (mais preciso no Brasil) e,
 * na ausência de CEP, faz busca textual. Retorna null se nada for encontrado.
 */
export async function geocodeByAddress(endereco: string | null | undefined): Promise<GeocodeResult | null> {
  const texto = (endereco || '').trim();
  if (!texto) return null;

  const cep = extrairCep(texto);
  if (cep) {
    const porCep = await geocodePorCep(cep);
    if (porCep) return porCep;
  }

  return geocodePorTexto(texto);
}
