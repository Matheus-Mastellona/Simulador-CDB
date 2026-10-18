export interface HistoricoMes {
  mes: number;
  mesAno: string;
  aporte: number;
  rendimentoBruto: number;
  iof: number;
  ir: number;
  saldoBruto: number;
  saldoLiquido: number;
  totalInvestido: number;
}

export interface IrFaixa {
  faixa: string;
  aliquota: number;
  rendimento: number;
  ir: number;
}

export interface ResultadoInvestimento {
  historico: HistoricoMes[];

  saldoFinalBruto: number;
  saldoFinalLiquido: number;
  saldoInicial: number;
  totalInvestido: number;
  totalRendimentoBruto: number;
  totalIof: number;
  totalIr: number;
  totalRendimentoLiquido: number;

  irDetalhado: IrFaixa[];
  aliquotaIrMedia: number;

  rendimentoCarteira: number;   // % acumulado bruto
  rendimentoBruto: number;      // % sobre aportes
  rendimentoLiquido: number;    // % sobre aportes após IR+IOF

  meses: number;
  taxaMensalEfetiva: number;    // taxa mensal equivalente ao CDI anual × % CDI
  cdiAnual: number;
  percentualCdi: number;
}

export interface ParamsInvestimento {
  saldoInicial: number;
  aporteMensal: number;
  meses: number;
  cdiAnual: number;        // decimal, ex: 0.105 = 10,5% a.a.
  percentualCdi: number;   // decimal, ex: 1.0 = 100%
  diaAporte: number;       // 1–28
  dataInicio: Date;
}

export interface Preset {
  nome: string;
  banco: string;
  percentualCdi: number;
  cor: string;
}
