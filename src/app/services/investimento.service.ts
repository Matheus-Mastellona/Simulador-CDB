import { Injectable } from '@angular/core';
import {
  HistoricoMes,
  IrFaixa,
  ParamsInvestimento,
  ResultadoInvestimento,
} from '../models/investimento.model';
import { CdiDia } from './cdi.service';
import { CalendarioService } from './calendario.service';

// ─── Tabela IOF — Decreto 6.306/2007 ────────────────────────────────────────
const TABELA_IOF = [
  0,
  0.96, 0.93, 0.90, 0.86, 0.83, 0.80, 0.76, 0.73, 0.70, 0.66,
  0.63, 0.60, 0.56, 0.53, 0.50, 0.46, 0.43, 0.40, 0.36, 0.33,
  0.30, 0.26, 0.23, 0.20, 0.16, 0.13, 0.10, 0.06, 0.03, 0.00,
];
function aliquotaIof(dias: number): number {
  if (dias <= 0)  return TABELA_IOF[1];
  if (dias >= 30) return 0;
  return TABELA_IOF[dias];
}

function aliquotaIr(dias: number): number {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.200;
  if (dias <= 720) return 0.175;
  return 0.150;
}
function labelIr(aliq: number): string {
  switch (aliq) {
    case 0.225: return 'Até 180 dias (22,5%)';
    case 0.200: return '181–360 dias (20%)';
    case 0.175: return '361–720 dias (17,5%)';
    default:    return 'Acima de 720 dias (15%)';
  }
}

function diasCorridos(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}
const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun',
                  'Jul','Ago','Set','Out','Nov','Dez'];

interface AporteRecord {
  principal:   number;
  saldoBruto:  number;
  dataEntrada: Date;
}

@Injectable({ providedIn: 'root' })
export class InvestimentoService {

  constructor(private cal: CalendarioService) {}

  diasUteisReais(ano: number, mes: number): number {
    return this.cal.diasUteisNoMes(ano, mes);
  }

  private buildTaxaMap(taxasDiarias: CdiDia[], percentualCdi: number): Map<string, number> {
    const map = new Map<string, number>();
    for (const c of taxasDiarias) {
      map.set(c.data.toISOString().slice(0, 10), c.taxaDia * percentualCdi);
    }
    return map;
  }

  /**
   * Verifica se um mês tem pelo menos um dia no mapa de taxas reais.
   * Se não tiver, usa fórmula direta — sem loop dia a dia.
   */
  private mesTemDadosReais(ano: number, mes: number, taxaMap: Map<string, number>): boolean {
    // Checa apenas o primeiro dia útil do mês para decidir
    const total = diasNoMes(ano, mes);
    for (let d = 1; d <= total; d++) {
      const key = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (taxaMap.has(key)) return true;
    }
    return false;
  }

  /**
   * Fator de crescimento para um mês:
   * - Se tem dados reais: itera dia a dia (preciso, mas só para histórico curto)
   * - Se é projeção futura: fórmula direta (1 + taxaDia)^duMes — instantâneo
   */
  private fatorMes(
    ano: number, mes: number,
    duMes: number,
    diaInicio: number,       // 1 = mês completo, >1 = parcial (novo aporte)
    taxaMap: Map<string, number>,
    taxaDiaProj: number,
  ): number {
    const dmAno = diasNoMes(ano, mes);

    if (this.mesTemDadosReais(ano, mes, taxaMap)) {
      // ── Iteração dia a dia com taxas reais ──────────────────────────
      let fator = 1;
      let du = 0;
      const d = new Date(ano, mes, diaInicio);
      const fim = new Date(ano, mes + 1, 0); // último dia do mês
      while (d <= fim && du < duMes) {
        if (this.cal.isDiaUtil(d)) {
          const key = d.toISOString().slice(0, 10);
          const taxa = taxaMap.has(key) ? taxaMap.get(key)! : taxaDiaProj;
          fator *= (1 + taxa);
          du++;
        }
        d.setDate(d.getDate() + 1);
      }
      return fator;
    }

    // ── Fórmula direta para projeção futura — sem loop ──────────────
    // duMes já está ajustado (dias úteis restantes para aporte parcial)
    const du = diaInicio === 1
      ? duMes
      : Math.round(duMes * (dmAno - diaInicio) / dmAno);
    return Math.pow(1 + taxaDiaProj, du);
  }

  calcular(p: ParamsInvestimento, taxasDiarias: CdiDia[] = []): ResultadoInvestimento {
    const diaAporte    = Math.min(Math.max(Math.round(p.diaAporte), 1), 28);
    const ultimaTaxaDia = taxasDiarias.length > 0
      ? taxasDiarias[taxasDiarias.length - 1].taxaDia
      : Math.pow(1 + p.cdiAnual, 1 / 252) - 1;

    const taxaMap      = this.buildTaxaMap(taxasDiarias, p.percentualCdi);
    const taxaDiaProj  = ultimaTaxaDia * p.percentualCdi;

    const anoR = p.dataInicio.getFullYear() + Math.floor((p.dataInicio.getMonth() + p.meses) / 12);
    const mesR = (p.dataInicio.getMonth() + p.meses) % 12;
    const dataResgate = new Date(anoR, mesR, Math.min(diaAporte, diasNoMes(anoR, mesR)));

    const registros: AporteRecord[] = [];
    if (p.saldoInicial > 0) {
      registros.push({
        principal:   p.saldoInicial,
        saldoBruto:  p.saldoInicial,
        dataEntrada: new Date(p.dataInicio.getFullYear(), p.dataInicio.getMonth(), 1),
      });
    }

    let totalInvestido = p.saldoInicial;
    const historico: HistoricoMes[] = [];
    let ano = p.dataInicio.getFullYear();
    let mes = p.dataInicio.getMonth();

    for (let i = 1; i <= p.meses; i++) {
      const dmAno  = diasNoMes(ano, mes);
      const diaEnt = Math.min(diaAporte, dmAno);
      const duMes  = this.diasUteisReais(ano, mes);

      // ── Aportes existentes: mês completo ────────────────────────────
      const fatorMesCompleto = this.fatorMes(ano, mes, duMes, 1, taxaMap, taxaDiaProj);
      let rendExist = 0;
      for (const r of registros) {
        const rend = r.saldoBruto * (fatorMesCompleto - 1);
        r.saldoBruto += rend;
        rendExist += rend;
      }

      // ── Novo aporte: parcial (dias restantes após diaAporte) ─────────
      const fatorNovo = this.fatorMes(ano, mes, duMes, diaEnt, taxaMap, taxaDiaProj);
      const rendNovo  = p.aporteMensal * (fatorNovo - 1);
      registros.push({
        principal:   p.aporteMensal,
        saldoBruto:  p.aporteMensal + rendNovo,
        dataEntrada: new Date(ano, mes, diaEnt),
      });

      totalInvestido += p.aporteMensal;

      const saldoBrutoTotal = registros.reduce((s, r) => s + r.saldoBruto, 0);

      // IR/IOF snapshot do fim do mês
      const dataFimMes = new Date(ano, mes, dmAno);
      let irSnap = 0, iofSnap = 0;
      for (const r of registros) {
        const lucro = r.saldoBruto - r.principal;
        if (lucro <= 0) continue;
        const dias   = diasCorridos(r.dataEntrada, dataFimMes);
        const iofVal = lucro * aliquotaIof(dias);
        iofSnap += iofVal;
        irSnap  += (lucro - iofVal) * aliquotaIr(dias);
      }

      historico.push({
        mes: i, mesAno: `${MESES_PT[mes]}/${ano}`,
        aporte: p.aporteMensal,
        rendimentoBruto: rendExist + rendNovo,
        iof: iofSnap, ir: irSnap,
        saldoBruto: saldoBrutoTotal,
        saldoLiquido: saldoBrutoTotal - iofSnap - irSnap,
        totalInvestido,
      });

      mes++; if (mes > 11) { mes = 0; ano++; }
    }

    // ── IR/IOF definitivos no resgate ────────────────────────────────────
    const faixaMap = new Map<number, { rendimento: number; ir: number }>([
      [0.225,{rendimento:0,ir:0}],[0.200,{rendimento:0,ir:0}],
      [0.175,{rendimento:0,ir:0}],[0.150,{rendimento:0,ir:0}],
    ]);
    let totalRendBruto = 0, totalIof = 0, totalIr = 0;

    for (const r of registros) {
      const lucro = r.saldoBruto - r.principal;
      if (lucro <= 0) continue;
      const dias   = diasCorridos(r.dataEntrada, dataResgate);
      const iofVal = lucro * aliquotaIof(dias);
      const baseIr = lucro - iofVal;
      const irAliq = aliquotaIr(dias);
      const irVal  = baseIr * irAliq;
      totalRendBruto += lucro;
      totalIof       += iofVal;
      totalIr        += irVal;
      const entry = faixaMap.get(irAliq)!;
      entry.rendimento += baseIr;
      entry.ir         += irVal;
    }

    const saldoFinalBruto   = registros.reduce((s, r) => s + r.saldoBruto, 0);
    const totalRendLiq      = totalRendBruto - totalIof - totalIr;
    const saldoFinalLiquido = saldoFinalBruto - totalIof - totalIr;
    const aliqIrMedia       = totalRendBruto > 0 ? totalIr / totalRendBruto : 0;
    const taxaMensal        = Math.pow(1 + taxaDiaProj, 21) - 1;
    const rendCarteira      = ((1 + taxaMensal) ** p.meses - 1) * 100;

    const irDetalhado: IrFaixa[] = [];
    faixaMap.forEach((v, aliq) => {
      if (v.rendimento > 0.001)
        irDetalhado.push({ faixa: labelIr(aliq), aliquota: aliq, rendimento: v.rendimento, ir: v.ir });
    });

    return {
      historico, saldoFinalBruto, saldoFinalLiquido,
      saldoInicial: p.saldoInicial, totalInvestido,
      totalRendimentoBruto: totalRendBruto,
      totalIof, totalIr,
      totalRendimentoLiquido: totalRendLiq,
      irDetalhado, aliquotaIrMedia: aliqIrMedia,
      rendimentoCarteira: rendCarteira,
      rendimentoBruto:    totalInvestido > 0 ? (totalRendBruto / totalInvestido) * 100 : 0,
      rendimentoLiquido:  totalInvestido > 0 ? (totalRendLiq   / totalInvestido) * 100 : 0,
      meses: p.meses, taxaMensalEfetiva: taxaMensal,
      cdiAnual: p.cdiAnual, percentualCdi: p.percentualCdi,
    };
  }
}
