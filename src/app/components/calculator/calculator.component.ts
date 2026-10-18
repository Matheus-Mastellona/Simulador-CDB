import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { Subject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, switchMap, startWith } from 'rxjs/operators';

import { InvestimentoService } from '../../services/investimento.service';
import { CdiService, CdiDia } from '../../services/cdi.service';
import { Preset, ResultadoInvestimento } from '../../models/investimento.model';

Chart.register(...registerables);

function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalculatorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  form!: FormGroup;
  resultado: ResultadoInvestimento | null = null;
  chartType: 'line' | 'bar' = 'line';
  presetAtivo: string | null = null;
  tab: 'simular' | 'resultado' | 'historico' | 'info' = 'simular';

  // CDI em tempo real
  cdiAtualAnual: number | null = null;
  cdiStatus: 'carregando' | 'ok' | 'erro' = 'carregando';
  cdiUltimaData: string = '';

  // Taxas reais carregadas da API
  private taxasDiarias: CdiDia[] = [];

  private chart: Chart | null = null;
  private destroy$ = new Subject<void>();
  readonly MAX_TABLE_ROWS = 120;

  readonly PRESETS: Preset[] = [
    { nome: 'Inter CDB',     banco: 'inter',  percentualCdi: 1.00, cor: '#ff6b00' },
    { nome: 'Itaú CDB-DI',  banco: 'itau',   percentualCdi: 0.97, cor: '#003087' },
    { nome: 'Nubank',        banco: 'nu',     percentualCdi: 1.00, cor: '#8a05be' },
    { nome: 'Personalizado', banco: 'custom', percentualCdi: 1.00, cor: '#6c63ff' },
  ];

  constructor(
    private fb: FormBuilder,
    private svc: InvestimentoService,
    private cdiSvc: CdiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      saldoInicial:  [0,            [Validators.required, Validators.min(0)]],
      aporteMensal:  [500,          [Validators.required, Validators.min(0.01)]],
      meses:         [12,           [Validators.required, Validators.min(1), Validators.max(600)]],
      cdiAnual:      [10.50,        [Validators.required, Validators.min(0.01)]],
      percentualCdi: [100,          [Validators.required, Validators.min(1), Validators.max(200)]],
      diaAporte:     [5,            [Validators.required, Validators.min(1), Validators.max(28)]],
      dataInicio:    [mesAtualISO(),[Validators.required]],
    });

    // Busca CDI atual ao iniciar
    this.carregarCdiAtual();

    // Quando dataInicio muda, recarrega histórico CDI real se necessário
    this.form.get('dataInicio')!.valueChanges
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(() => this.carregarCdiHistorico());

    // Recalcula ao mudar qualquer campo
    this.form.valueChanges
      .pipe(debounceTime(200), takeUntil(this.destroy$))
      .subscribe(() => this.calcular());

    this.calcular();
  }

  ngAfterViewInit(): void { if (this.resultado) this.buildChart(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chart?.destroy();
  }

  // ── Carrega CDI atual (últimos 5 dias úteis) ────────────────────────────
  private carregarCdiAtual(): void {
    this.cdiStatus = 'carregando';
    this.cdiSvc.buscarUltimos(5).subscribe({
      next: dias => {
        if (dias.length > 0) {
          const ultimo = dias[dias.length - 1];
          this.cdiAtualAnual = this.cdiSvc.diaParaAnual(ultimo.taxaDia) * 100;
          this.cdiUltimaData = this.formatData(ultimo.data);
          this.cdiStatus = 'ok';
          // Atualiza campo cdiAnual com valor real
          this.form.patchValue(
            { cdiAnual: +this.cdiAtualAnual.toFixed(2) },
            { emitEvent: false }
          );
        } else {
          this.cdiStatus = 'erro';
        }
        this.carregarCdiHistorico();
        this.cdr.markForCheck();
      },
      error: () => { this.cdiStatus = 'erro'; this.cdr.markForCheck(); },
    });
  }

  // ── Carrega histórico real desde dataInicio até hoje ───────────────────
  private carregarCdiHistorico(): void {
    const v = this.form.get('dataInicio')?.value as string;
    if (!v) return;

    const [ano, mes] = v.split('-').map(Number);
    const inicio = new Date(ano, mes - 1, 1);
    const hoje   = new Date();

    // Só busca histórico se a data de início for no passado
    if (inicio >= hoje) {
      this.taxasDiarias = [];
      this.calcular();
      return;
    }

    this.cdiSvc.buscarPeriodo(inicio, hoje).subscribe({
      next: dias => {
        this.taxasDiarias = dias;
        this.calcular();
        this.cdr.markForCheck();
      },
      error: () => {
        this.taxasDiarias = [];
        this.calcular();
      },
    });
  }

  aplicarPreset(preset: Preset): void {
    this.presetAtivo = preset.banco;
    if (preset.banco === 'custom') {
      this.form.get('percentualCdi')?.enable({ emitEvent: false });
    } else {
      this.form.patchValue({ percentualCdi: preset.percentualCdi * 100 }, { emitEvent: false });
      this.form.get('percentualCdi')?.disable({ emitEvent: false });
    }
    this.calcular();
    this.cdr.markForCheck();
  }

  calcular(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const [ano, mes] = (v.dataInicio as string).split('-').map(Number);

    this.resultado = this.svc.calcular(
      {
        saldoInicial:  +v.saldoInicial,
        aporteMensal:  +v.aporteMensal,
        meses:         +v.meses,
        cdiAnual:      +v.cdiAnual / 100,
        percentualCdi: +v.percentualCdi / 100,
        diaAporte:     +v.diaAporte,
        dataInicio:    new Date(ano, mes - 1, 1),
      },
      this.taxasDiarias,
    );
    this.buildChart();
    this.cdr.markForCheck();
  }

  setChartType(type: 'line' | 'bar'): void {
    this.chartType = type;
    this.buildChart();
  }

  private buildChart(): void {
    if (!this.chartCanvas || !this.resultado) return;
    const hist = this.resultado.historico;
    const step = Math.max(1, Math.floor(hist.length / 60));
    const s    = hist.filter((_, i) => i % step === 0 || i === hist.length - 1);

    this.chart?.destroy();
    const isLine = this.chartType === 'line';

    this.chart = new Chart(this.chartCanvas.nativeElement, {
      type: isLine ? 'line' : 'bar',
      data: {
        labels: s.map(h => h.mesAno),
        datasets: [
          {
            label: 'Total Investido',
            data: s.map(h => h.totalInvestido),
            backgroundColor: isLine ? 'rgba(108,99,255,0.18)' : 'rgba(108,99,255,0.75)',
            borderColor: '#6c63ff', borderWidth: 2,
            fill: isLine, tension: 0.4, pointRadius: 0,
            stack: isLine ? undefined : 'stack',
          },
          {
            label: 'Rendimento Bruto',
            data: s.map(h => h.saldoBruto - h.totalInvestido),
            backgroundColor: isLine ? 'rgba(0,212,170,0.18)' : 'rgba(0,212,170,0.75)',
            borderColor: '#00d4aa', borderWidth: 2,
            fill: isLine, tension: 0.4, pointRadius: 0,
            stack: isLine ? undefined : 'stack',
          },
          {
            label: 'IR + IOF estimado',
            data: s.map(h => h.iof + h.ir),
            backgroundColor: isLine ? 'rgba(255,107,107,0.15)' : 'rgba(255,107,107,0.65)',
            borderColor: '#ff6b6b', borderWidth: 2,
            fill: isLine, tension: 0.4, pointRadius: 0,
            stack: isLine ? undefined : 'stack',
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#8b90a8', font: { size: 12 }, boxWidth: 12 } },
          tooltip: {
            backgroundColor: '#1a1d27', borderColor: '#2e3248', borderWidth: 1,
            titleColor: '#e8eaf0', bodyColor: '#8b90a8',
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${this.brl(ctx.parsed.y)}` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(46,50,72,0.6)' }, ticks: { color: '#8b90a8', maxTicksLimit: 10, font: { size: 11 } } },
          y: {
            grid: { color: 'rgba(46,50,72,0.6)' }, stacked: !isLine,
            ticks: {
              color: '#8b90a8', font: { size: 11 },
              callback: v => {
                const n = +v;
                if (n >= 1e6) return 'R$' + (n/1e6).toFixed(1) + 'M';
                if (n >= 1e3) return 'R$' + (n/1e3).toFixed(0) + 'k';
                return this.brl(n);
              },
            },
          },
        },
      },
    });
  }

  get tableRows() {
    if (!this.resultado) return [];
    return this.resultado.historico;
  }

  get tableHint(): string {
    if (!this.resultado) return '';
    return `${this.resultado.historico.length} meses`;
  }

  get taxaMensalLabel(): string {
    if (!this.resultado) return '';
    return `${(this.resultado.taxaMensalEfetiva * 100).toFixed(4)}% a.m.`;
  }

  get temHistoricoReal(): boolean {
    return this.taxasDiarias.length > 0;
  }

  /** CDI exibido no chip = sempre o valor atual do campo, não o da API */
  get cdiChipValor(): string {
    const v = this.form?.get('cdiAnual')?.value;
    return v != null ? (+v).toFixed(2) : '—';
  }

  resetCdi(): void {
    if (this.cdiAtualAnual == null) return;
    this.form.patchValue({ cdiAnual: +this.cdiAtualAnual.toFixed(2) });
  }

  brl(v: number): string { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  pct(v: number): string { return v.toFixed(2) + '%'; }

  private formatData(d: Date): string {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
}
