# 📈 Simulador CDB — Renda Fixa

App Android + Web para simular investimentos em renda fixa com metodologia igual à dos bancos.

![Angular](https://img.shields.io/badge/Angular-20-red?logo=angular)
![Capacitor](https://img.shields.io/badge/Capacitor-6-blue?logo=capacitor)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)

---

## ✨ Funcionalidades

- **CDI real em tempo real** — busca automaticamente a taxa CDI da API do Banco Central (BCB série SGS 12)
- **Histórico real** — para datas passadas, usa as taxas CDI dia a dia publicadas pelo BCB
- **IR por aporte individual** — cada aporte tem seu prazo e paga a alíquota correspondente (22,5% → 15%)
- **IOF pela tabela oficial** — Decreto 6.306/2007, primeiros 30 dias
- **Calendário ANBIMA** — dias úteis com feriados móveis (Carnaval, Páscoa, Corpus Christi) calculados automaticamente
- **Presets de bancos** — Inter CDB (100% CDI), Itaú CDB-DI (97%), Nubank (100%)
- **Guia de uso** — explicação de cada campo e de cada número no resultado
- **App Android** — gerado com Capacitor, instala direto no celular

## 📱 Telas

| Simular | Resultado | Histórico | Como Funciona |
|---------|-----------|-----------|---------------|
| Parâmetros do investimento | Saldo líquido, bruto, IR e IOF | Evolução mês a mês | Guia de uso e metodologia |

---

## 🧮 Metodologia

O cálculo segue a mesma convenção usada pelos bancos brasileiros:

```
taxa_dia = CDI_diário × % do CDI          (convenção B3/CETIP)
fator_mês = (1 + taxa_dia)^dias_úteis     (base DU/252)
```

- **IR**: tabela regressiva por dias corridos de cada aporte (não do total)
- **IOF**: tabela do Decreto 6.306/2007 (96% no dia 1 → 0% a partir do dia 30)
- **Dias úteis**: calendário ANBIMA real, incluindo feriados móveis

---

## 🚀 Como rodar

### Web (desenvolvimento)
```bash
npm install
```
Duplo clique em **`setup.bat`** — sobe o servidor e abre o browser em `http://localhost:65103`

### Android (APK)
```bash
npm install
node node_modules\@angular\cli\bin\ng.js build --configuration production
node cap-sync.js
```
Depois no Android Studio: **Build → Build APK(s)**

O APK gerado fica em:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📁 Estrutura

```
src/
  app/
    components/calculator/   ← UI (template, lógica, CSS)
    services/
      investimento.service.ts ← cálculo principal (CDI, IR, IOF)
      cdi.service.ts          ← integração API do Banco Central
      calendario.service.ts   ← calendário ANBIMA (feriados móveis)
    models/
      investimento.model.ts   ← interfaces TypeScript
  styles.css                  ← tema dark global
  main.ts                     ← bootstrap standalone
```

---

## 🛠 Stack

- **Angular 20** (standalone components, reactive forms)
- **Chart.js 4** (gráficos)
- **Capacitor 6** (Android)
- **API BCB** — [SGS série 12](https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/5?formato=json) (CDI diário)

---

## ⚠️ Aviso

Simulação com CDI fixo hipotético para períodos futuros. O CDI real varia diariamente conforme as decisões do COPOM. Não constitui recomendação de investimento.

---

## 📄 Licença

MIT
