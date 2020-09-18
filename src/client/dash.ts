import 'chartjs-plugin-streaming';
import { Gauge, GaugeOptions } from 'gaugeJS';
import $ from 'jquery';
import Chart = require('chart.js');
import moment = require('moment');
import momentDurationFormatSetup = require('moment-duration-format');

const dash = {
  ws: null,

  deviceId: '',

  realtimeGauge: null,
  realtimeTrendChart: null,
  realtimeTrendLastSample: 0,

  dailyUsageChart: null,
  monthlyUsageChart: null,
  usageLogChart: null,

  init(deviceId: string) {
    if (deviceId) {
      dash.deviceId = deviceId;
      $(`.${deviceId}`).addClass('active');
    }

    // @ts-ignore
    momentDurationFormatSetup(moment);

    dash.initRealtimeGauge();
    dash.initRealtimeTrendChart();
    dash.initDailyUsageChart();
    dash.initMonthlyUsageChart();
    dash.initUsageLog();

    dash.initWsConnection();
    dash.initTogglePowerState();
  },

  initWsConnection() {
    const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUri = `${scheme + window.location.host}/ws`;

    const ws = new WebSocket(wsUri);
    ws.onopen = () => {
      console.info('Websocket connection established');

      $('#connection-error').hide(200);

      ws.send(
        JSON.stringify({
          requestType: 'getCachedData',
          deviceId: dash.deviceId,
        }),
      );
    };

    ws.onmessage = dash.wsMessageHandler;

    ws.onclose = () => {
      // Usually caused by mobile devices going to sleep or the user minimising the browser app.
      // The setTimeout will begin once the device wakes from sleep or the browser regains focus.
      $('#connection-error').show();
      setTimeout(dash.initWsConnection, 2000);
    };

    dash.ws = ws;
  },

  wsMessageHandler(messageEvent: { data: string }) {
    const message = JSON.parse(messageEvent.data);
    if (message.deviceId === dash.deviceId) {
      if (message.dataType === 'realtimeUsage') {
        dash.refreshRealtimeDisplay(message.data);
      } else if (message.dataType === 'dailyUsage') {
        dash.parseDailyUsageData(message.data);
      } else if (message.dataType === 'monthlyUsage') {
        dash.parseMonthlyUsageData(message.data);
      } else if (message.dataType === 'powerState') {
        dash.refreshPowerState(message.data);
      } else if (message.dataType === 'newLogEntry') {
        dash.addLogEntry(message.data, true);
      } else if (message.dataType === 'loggedData') {
        dash.loadLogEntries(message.data);
        dash.loadLastSession(message.data);
      }
    }
  },

  initRealtimeGauge() {
    const opts: GaugeOptions = {
      angle: 0,
      lineWidth: 0.2,
      pointer: {
        length: 0.6,
        strokeWidth: 0.035,
        color: '#000000',
      },
      limitMax: true,
      limitMin: true,
      generateGradient: true,
      highDpiSupport: true,
      colorStart: '#000000',
      colorStop: '#F03E3E',
      strokeColor: '#000000',
      radiusScale: 0.5,
      staticLabels: {
        font: '12px sans-serif',
        labels: [500, 1500, 3000],
      },
      staticZones: [
        { strokeStyle: '#30B32D', min: 0, max: 500 },
        { strokeStyle: '#FFDD00', min: 500, max: 2400 },
        { strokeStyle: '#F03E3E', min: 2400, max: 3000 },
      ],
    };
    const target = <HTMLCanvasElement>document.getElementById('rtu-gauge');

    dash.realtimeGauge = new Gauge(target).setOptions(opts);
    dash.realtimeGauge.maxValue = 3000;
    dash.realtimeGauge.setMinValue(0);
    dash.realtimeGauge.animationSpeed = 32;
  },

  initRealtimeTrendChart() {
    const canvas = <HTMLCanvasElement>document.getElementById('rtt-chart');
    const ctx = canvas.getContext('2d');

    this.realtimeTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Power (W)',
            borderColor: 'rgb(255, 99, 132)',
            data: [],
          },
        ],
      },
      options: {
        legend: {
          display: false,
        },
        scales: {
          xAxes: [
            {
              display: false,
              type: 'realtime',
            },
          ],
          yAxes: [
            {
              ticks: {
                beginAtZero: true,
              },
            },
          ],
        },
        maintainAspectRatio: false,
        tooltips: {
          intersect: false,
        },
        plugins: {
          streaming: {
            duration: 60000,
            refresh: 1000,
            delay: 1000,
            frameRate: 30,
            onRefresh: dash.realtimeTrendChartOnRefresh,
          },
        },
      },
    });
  },

  initDailyUsageChart() {
    const canvas = <HTMLCanvasElement>document.getElementById('du-chart');
    const ctx = canvas.getContext('2d');

    this.dailyUsageChart = new Chart(ctx, {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Energy (kWh)',
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgb(255, 99, 132)',
            data: [],
          },
        ],
      },
      options: {
        legend: {
          display: false,
        },
        scales: {
          yAxes: [
            {
              ticks: {
                beginAtZero: true,
              },
            },
          ],
        },
        maintainAspectRatio: false,
        tooltips: {
          intersect: false,
        },
      },
    });
  },

  initMonthlyUsageChart() {
    const canvas = <HTMLCanvasElement>document.getElementById('mu-chart');
    const ctx = canvas.getContext('2d');
    this.monthlyUsageChart = new Chart(ctx, {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Energy (kWh)',
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgb(255, 99, 132)',
            data: [],
          },
        ],
      },
      options: {
        legend: {
          display: false,
        },
        scales: {
          yAxes: [
            {
              ticks: {
                beginAtZero: true,
              },
            },
          ],
        },
        maintainAspectRatio: false,
        tooltips: {
          intersect: false,
        },
      },
    });
  },

  initUsageLog() {
    const canvas = <HTMLCanvasElement>document.getElementById('logged-usage-chart');
    const ctx = canvas.getContext('2d');

    this.usageLogChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Power (W)',
            borderColor: 'rgb(255, 99, 132)',
            data: [],
          },
        ],
      },
      options: {
        legend: {
          display: false,
        },
        scales: {
          xAxes: [
            {
              display: true,
            },
          ],
          yAxes: [
            {
              ticks: {
                beginAtZero: true,
              },
            },
          ],
        },
        maintainAspectRatio: false,
        tooltips: {
          intersect: false,
        },
      },
    });
  },

  initTogglePowerState: () => {
    $('#power-state').on('click', () => {
      if (dash.ws) {
        dash.ws.send(
          JSON.stringify({
            requestType: 'togglePowerState',
            deviceId: dash.deviceId,
          }),
        );
      }
    });
  },

  addLogEntry(logEntry, updateChart) {
    dash.usageLogChart.data.labels.push(moment(logEntry.ts, 'x').format('MMM Do HH:mm'));
    dash.usageLogChart.data.datasets.forEach((dataset) => {
      dataset.data.push({
        x: logEntry.ts,
        y: logEntry.pw,
      });
    });
    if (updateChart) {
      dash.usageLogChart.update();
    }
  },

  loadLogEntries(logEntries) {
    dash.initUsageLog();

    logEntries.forEach((entry) => {
      dash.addLogEntry(entry, false);
    });

    dash.usageLogChart.update();
  },

  loadLastSession(logEntries) {
    const threshold = 5;
    let startIndex = 0;
    let lastSessionkWh = 0;

    for (let i = logEntries.length - 1; i > 0; i -= 1) {
      if (logEntries[i].pw > threshold) {
        startIndex = i;
        break;
      }
    }

    if (startIndex > 0) {
      let endIndex = -1;
      for (let i = startIndex - 1; i >= 0; i -= 1) {
        if (logEntries[i].pw < threshold || i === 0) {
          endIndex = i;
          break;
        }
      }

      if (endIndex >= 0) {
        if (startIndex === logEntries.length - 1) {
          startIndex -= 1;
        }
        for (let i = endIndex; i < startIndex; i += 1) {
          const entry = logEntries[i];
          const power = entry.pw;
          const time = logEntries[i + 1].ts - entry.ts;
          const kWh = (power * time) / 3600000000;
          lastSessionkWh += kWh;
        }
      }

      $('#lastsession').text((endIndex === 0 ? '>' : '') + lastSessionkWh.toFixed(1));
    }
  },

  realtimeTrendChartOnRefresh(chart) {
    chart.data.datasets.forEach((dataset) => {
      dataset.data.push({
        x: Date.now(),
        y: dash.realtimeTrendLastSample,
      });
    });
  },

  refreshRealtimeDisplay(realtime) {
    const power = ('power_mw' in realtime ? realtime.power_mw / 1000 : realtime.power).toPrecision(3);
    const current = ('current_ma' in realtime ? realtime.current_ma / 1000 : realtime.current).toFixed(2);
    const voltage = Math.round('voltage_mv' in realtime ? realtime.voltage_mv / 1000 : realtime.voltage);

    this.realtimeGauge.set(power);
    // might switch to Vue.js if this gets tedious
    $('#rtu-power').text(`${power} W`);
    $('#rtu-current').text(`${current} A`);
    $('#rtu-voltage').text(`${voltage} V`);

    this.realtimeTrendLastSample = power;
  },

  parseDailyUsageData(usageData) {
    // Clear previous data
    dash.dailyUsageChart.data.labels = [];
    dash.dailyUsageChart.data.datasets.forEach((dataset) => ({
      ...dataset,
      data: [],
    }));

    usageData.forEach((entry) => {
      // Months from API response are 1 based
      const day = moment([entry.year, entry.month - 1, entry.day]);

      dash.dailyUsageChart.data.labels.push(day.format('MMM D'));
      dash.dailyUsageChart.data.datasets.forEach((dataset) => {
        dataset.data.push(dash.energyEntryInkWh(entry));
      });
    });

    dash.dailyUsageChart.update();
    dash.setDailyUsageStats(usageData);
  },

  setDailyUsageStats(usageData) {
    const dailyTotal = usageData.find(
      (d) => d.day === moment().date() && d.month === moment().month() + 1 && d.year === moment().year(),
    );

    const energy = dash.energyEntryInkWh(dailyTotal);
    $('#total-day').text(energy.toFixed(2));

    const total = usageData.reduce((t, d) => t + dash.energyEntryInkWh(d), 0);
    const avg = total / usageData.length;

    $('#30total').text(total.toFixed(0));
    $('#avg-day').text(avg.toFixed(2));
  },

  parseMonthlyUsageData(usageData) {
    // Clear previous data
    dash.monthlyUsageChart.data.labels = [];
    dash.monthlyUsageChart.data.datasets.forEach((dataset) => ({ ...dataset, data: [] }));

    usageData.forEach((entry) => {
      // Months from API response are 1 based
      const month = moment().month(entry.month - 1);

      dash.monthlyUsageChart.data.labels.push(month.format('MMM'));
      dash.monthlyUsageChart.data.datasets.forEach((dataset) => {
        dataset.data.push(dash.energyEntryInkWh(entry));
      });
    });

    dash.monthlyUsageChart.update();
    dash.setMonthlyUsageStats(usageData);
  },

  setMonthlyUsageStats(usageData) {
    const monthlyTotal = usageData.find((m) => m.month === moment().month() + 1 && m.year === moment().year());
    const energy = dash.energyEntryInkWh(monthlyTotal);
    $('#total-month').text(energy.toFixed(2));

    // don't use latest (current) month in the average and don't use months with zero usage
    const nonZeroCompleteMonths = usageData.slice(0, usageData.length - 1).filter((u) => dash.energyEntryInkWh(u) > 0);
    const total = nonZeroCompleteMonths.reduce((t, m) => t + dash.energyEntryInkWh(m), 0);
    const avg = nonZeroCompleteMonths.length === 0 ? 0 : total / nonZeroCompleteMonths.length;

    $('#avg-month').text(avg.toFixed(2));
    const allTotal = total + dash.energyEntryInkWh(usageData[usageData.length - 1]);
    $('#monthstotal').text(allTotal.toFixed(0));
  },

  energyEntryInkWh(entry) {
    return 'energy_wh' in entry ? entry.energy_wh / 1000 : entry.energy;
  },

  refreshPowerState(powerState) {
    if (powerState.isOn) {
      $('#power-state').text('ON').attr('class', 'label label-success');
    } else {
      $('#power-state').text('OFF').attr('class', 'label label-danger');
    }

    if (powerState.uptime === 0) {
      $('#uptime').text('-');
    } else if (powerState.uptime > 60) {
      $('#uptime').text(moment.duration(powerState.uptime, 'seconds').format('d[d] h[h] m[m]', { largest: 2 }));
    } else {
      $('#uptime').text(moment.duration(powerState.uptime, 'seconds').format('m[m] s[s]', { largest: 2 }));
    }
  },
};
