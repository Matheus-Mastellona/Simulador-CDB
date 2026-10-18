import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay, catchError, of } from 'rxjs';

export interface CdiDia {
  data: Date;
  taxaDia: number; // taxa diária em decimal, ex: 0.00050788
}

interface BcbEntry {
  data: string;  // "DD/MM/YYYY"
  valor: string; // "0.050788" = 0.050788% ao dia
}

@Injectable({ providedIn: 'root' })
export class CdiService {
  // Série 12 = CDI diário (% ao dia)
  private readonly BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados';

  // Cache da última requisição para não bater a API a cada digitação
  private cache = new Map<string, Observable<CdiDia[]>>();

  constructor(private http: HttpClient) {}

  /**
   * Busca CDI diário entre duas datas.
   * Formato BCB: DD/MM/YYYY
   */
  buscarPeriodo(inicio: Date, fim: Date): Observable<CdiDia[]> {
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

    const key = `${fmt(inicio)}_${fmt(fim)}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const url = `${this.BASE}?formato=json&dataInicial=${fmt(inicio)}&dataFinal=${fmt(fim)}`;

    const obs$ = this.http.get<BcbEntry[]>(url).pipe(
      map(entries => entries.map(e => ({
        data:    this.parseData(e.data),
        taxaDia: parseFloat(e.valor) / 100, // converte % para decimal
      }))),
      catchError(() => of([] as CdiDia[])),
      shareReplay(1),
    );

    this.cache.set(key, obs$);
    return obs$;
  }

  /** Busca os últimos N dias úteis (para obter o CDI atual) */
  buscarUltimos(n = 5): Observable<CdiDia[]> {
    const key = `ultimos_${n}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const url = `${this.BASE}/ultimos/${n}?formato=json`;
    const obs$ = this.http.get<BcbEntry[]>(url).pipe(
      map(entries => entries.map(e => ({
        data:    this.parseData(e.data),
        taxaDia: parseFloat(e.valor) / 100,
      }))),
      catchError(() => of([] as CdiDia[])),
      shareReplay(1),
    );

    this.cache.set(key, obs$);
    return obs$;
  }

  /**
   * Converte taxa diária decimal para anual equivalente (base 252 du).
   * Útil para exibir "CDI atual: X% a.a."
   */
  diaParaAnual(taxaDia: number): number {
    return Math.pow(1 + taxaDia, 252) - 1;
  }

  private parseData(s: string): Date {
    const [d, m, a] = s.split('/').map(Number);
    return new Date(a, m - 1, d);
  }
}
