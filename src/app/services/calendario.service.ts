import { Injectable } from '@angular/core';

/**
 * Calendário ANBIMA/FEBRABAN — feriados bancários nacionais.
 *
 * Inclui:
 *  - Feriados nacionais fixos (sempre na mesma data)
 *  - Feriados nacionais móveis calculados por ano (Carnaval, Sexta Santa,
 *    Corpus Christi, Consciência Negra — 20/nov a partir de 2024)
 *  - Último dia útil do ano (31/dez ou dia anterior, facultativo bancário)
 *
 * Feriados municipais/estaduais NÃO estão incluídos pois variam por praça
 * e não fazem parte do calendário ANBIMA nacional.
 *
 * Fonte: FEBRABAN / feriadosapi.com (calendários 2025–2028 verificados).
 */
@Injectable({ providedIn: 'root' })
export class CalendarioService {

  // ── Feriados fixos: [mes(0-indexed), dia] ────────────────────────────────
  private readonly FIXOS: [number, number][] = [
    [0,  1],  // Confraternização Universal
    [3,  21], // Tiradentes
    [4,  1],  // Dia do Trabalho
    [8,  7],  // Independência do Brasil
    [9,  12], // Nossa Senhora Aparecida
    [10, 2],  // Finados
    [10, 15], // Proclamação da República
    [10, 20], // Consciência Negra (lei federal a partir de 2024)
    [11, 25], // Natal
  ];

  /**
   * Retorna o conjunto de feriados bancários de um ano como Set de strings "YYYY-MM-DD".
   * Calculados dinamicamente para qualquer ano.
   */
  feriadosAno(ano: number): Set<string> {
    const set = new Set<string>();
    const add = (d: Date) => {
      if (!isNaN(d.getTime())) set.add(this.key(d));
    };

    // Fixos
    for (const [m, d] of this.FIXOS) {
      add(new Date(ano, m, d));
    }

    // Páscoa (algoritmo de Gauss/Meeus)
    const pascoa = this.calcularPascoa(ano);

    // Sexta-feira Santa = Páscoa - 2 dias
    const sextaSanta = new Date(pascoa);
    sextaSanta.setDate(sextaSanta.getDate() - 2);
    add(sextaSanta);

    // Carnaval: Segunda = Páscoa - 48, Terça = Páscoa - 47
    const carnavalSeg = new Date(pascoa);
    carnavalSeg.setDate(carnavalSeg.getDate() - 48);
    const carnavalTer = new Date(pascoa);
    carnavalTer.setDate(carnavalTer.getDate() - 47);
    // Quarta de Cinzas (facultativo bancário) = Páscoa - 46
    const quartaCinzas = new Date(pascoa);
    quartaCinzas.setDate(quartaCinzas.getDate() - 46);
    add(carnavalSeg);
    add(carnavalTer);
    add(quartaCinzas);

    // Corpus Christi = Páscoa + 60 dias (facultativo bancário)
    const corpus = new Date(pascoa);
    corpus.setDate(corpus.getDate() + 60);
    add(corpus);

    // Último dia útil do ano (31/dez ou o dia útil anterior — facultativo)
    // O banco fecha no último dia útil do ano
    const ultimoDia = this.ultimoDiaUtilAno(ano, set);
    if (ultimoDia) add(ultimoDia);

    return set;
  }

  /**
   * Verifica se uma data é dia útil bancário (não é fim de semana nem feriado ANBIMA).
   */
  isDiaUtil(data: Date): boolean {
    const ds = data.getDay();
    if (ds === 0 || ds === 6) return false;
    const feriados = this.feriadosAno(data.getFullYear());
    return !feriados.has(this.key(data));
  }

  /**
   * Conta dias úteis bancários em um mês.
   */
  diasUteisNoMes(ano: number, mes: number /* 0-indexed */): number {
    const feriados = this.feriadosAno(ano);
    const total = new Date(ano, mes + 1, 0).getDate();
    let uteis = 0;
    for (let d = 1; d <= total; d++) {
      const data = new Date(ano, mes, d);
      const ds = data.getDay();
      if (ds === 0 || ds === 6) continue;
      if (feriados.has(this.key(data))) continue;
      uteis++;
    }
    return uteis;
  }

  /**
   * Conta dias úteis entre duas datas (início inclusivo, fim exclusivo).
   */
  diasUteisPeriodo(inicio: Date, fim: Date): number {
    let count = 0;
    const d = new Date(inicio);
    while (d < fim) {
      if (this.isDiaUtil(d)) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  // ── Algoritmo de Gauss para calcular a Páscoa ────────────────────────────
  private calcularPascoa(ano: number): Date {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes, dia);
  }

  // ── Último dia útil do ano (facultativo bancário) ────────────────────────
  private ultimoDiaUtilAno(ano: number, feriadosExistentes: Set<string>): Date | null {
    // Percorre de 31/dez para trás até achar um dia útil (excluindo o próprio set)
    for (let d = 31; d >= 28; d--) {
      const data = new Date(ano, 11, d);
      const ds = data.getDay();
      if (ds !== 0 && ds !== 6 && !feriadosExistentes.has(this.key(data))) {
        return data;
      }
    }
    return null;
  }

  private key(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}
