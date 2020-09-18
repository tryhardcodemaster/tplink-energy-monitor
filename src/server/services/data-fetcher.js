const moment = require('moment');
const deviceManager = require('./device-manager');
const dataBroadcaster = require('./data-broadcaster');
const app = require('../app');

// Get initial data after a short delay to allow the device manager to find devices
// TODO run once device manager notifies its complete instead
setTimeout(() => {
  fetchRealtimeUsage();
  fetchDailyUsage();
  fetchMonthlyUsage();
  fetchPowerState();
}, 2000);

const cachedRealtimeUsageData = [];
const cachedDailyUsageData = [];
const cachedMonthlyUsageData = [];
const cachedPowerState = [];

function fetchRealtimeUsage() {
  if (app.getWsClientCount() > 0 || cachedRealtimeUsageData.length === 0) {
    deviceManager.getAllDevices().forEach((device) => {
      const { deviceId } = device;
      device.emeter.getRealtime().then((response) => {
        response.voltage = normaliseVoltage(response, device);
        updateCache(cachedRealtimeUsageData, deviceId, response);

        dataBroadcaster.broadcastRealtimeUsageUpdate(deviceId, response);
      });
    });
  }

  setTimeout(fetchRealtimeUsage, 1000);
}

function fetchDailyUsage() {
  if (app.getWsClientCount() > 0 || cachedDailyUsageData.length === 0) {
    // Get last x days
    const totalDaysRequired = 30; // TODO currently only works for up to 2 months spans
    const currentMoment = moment();
    const previousMoment = moment().subtract(totalDaysRequired, 'days');

    // Month + 1 as the API months are index 1 based.
    deviceManager.getAllDevices().forEach((device) => {
      const { deviceId } = device;
      device.emeter.getDayStats(currentMoment.year(), currentMoment.month() + 1).then((currentPeriodStats) => {
        // Check if we also need the previous month to meet the required total number of samples
        if (currentMoment.month() !== previousMoment.month()) {
          // Get previous month. This currently wont work if the previousMoment is more than 1 month before the currentMoment (see above)
          device.emeter.getDayStats(previousMoment.year(), previousMoment.month() + 1).then((previousPeriodStats) => {
            const currentMonthStats = fillMissingDays(currentPeriodStats, currentMoment);
            const previousMonthStats = fillMissingDays(previousPeriodStats, previousMoment);
            const combinedStats = previousMonthStats.concat(currentMonthStats);

            const result = trimStatResults(combinedStats, totalDaysRequired);

            updateCache(cachedDailyUsageData, deviceId, result);

            dataBroadcaster.broadcastDailyUsageUpdate(deviceId, result);
          });
        } else {
          const dayStats = fillMissingDays(currentPeriodStats, currentMoment);

          const result = trimStatResults(dayStats, totalDaysRequired);
          updateCache(cachedDailyUsageData, deviceId, result);

          dataBroadcaster.broadcastDailyUsageUpdate(deviceId, result);
        }
      });
    });
  }

  setTimeout(fetchDailyUsage, 300000); // 5 mins;
}

function fetchMonthlyUsage() {
  if (app.getWsClientCount() > 0 || cachedMonthlyUsageData.length === 0) {
    // Get last x months
    const totalMonthsRequired = 12; // TODO currently only works for up to 14 month (2 year) spans
    const currentMoment = moment();
    const previousMoment = moment().subtract(totalMonthsRequired, 'months');

    deviceManager.getAllDevices().forEach((device) => {
      const { deviceId } = device;
      device.emeter.getMonthStats(currentMoment.year()).then((currentPeriodStats) => {
        // Check if we also need the previous year to meet the required total number of samples
        if (currentMoment.month() + 1 < totalMonthsRequired) {
          // Get previous year (assuming the totalMonthsRequired limit described above).
          device.emeter.getMonthStats(previousMoment.year()).then((previousPeriodStats) => {
            const currentYearStats = fillMissingMonths(currentPeriodStats, currentMoment);
            const previousYearStats = fillMissingMonths(previousPeriodStats, previousMoment);
            const combinedStats = previousYearStats.concat(currentYearStats);

            const result = trimStatResults(combinedStats, totalMonthsRequired);

            updateCache(cachedMonthlyUsageData, deviceId, result);

            dataBroadcaster.broadcastMonthlyUsageUpdate(deviceId, result);
          });
        } else {
          const monthStats = fillMissingMonths(currentPeriodStats, currentMoment);

          const result = trimStatResults(monthStats, totalMonthsRequired);

          updateCache(cachedMonthlyUsageData, deviceId, result);

          dataBroadcaster.broadcastMonthlyUsageUpdate(deviceId, result);
        }
      });
    });
  }

  setTimeout(fetchMonthlyUsage, 1800000); // 30 mins
}

function fetchPowerState() {
  if (app.getWsClientCount() > 0 || cachedPowerState.length === 0) {
    deviceManager.getAllDevices().forEach((device) => {
      const { deviceId } = device;
      device.getSysInfo().then((response) => {
        const powerState = {
          isOn: (response.relay_state === 1),
          uptime: response.on_time,
        };

        updateCache(cachedPowerState, deviceId, powerState);

        dataBroadcaster.broadcastPowerStateUpdate(deviceId, powerState);
      });
    });
  }
  setTimeout(fetchPowerState, 60000);
}

function fillMissingDays(sparseDayStats, statsMoment) {
  const denseDayStats = [];

  let totalDays;
  // If these stats are for the current month, fill up to the current day of the month
  // Otherwise fill the whole month
  if (moment().month() === statsMoment.month()) {
    totalDays = statsMoment.date();
  } else {
    totalDays = statsMoment.daysInMonth();
  }

  Array.from({ length: totalDays }, (x, i) => i + 1).forEach((d) => {
    const stat = sparseDayStats.day_list.find((i) => i.day === d);

    if (stat === undefined) {
      denseDayStats.push({
        year: statsMoment.year(),
        month: statsMoment.month() + 1,
        day: d,
        energy: 0,
      });
    } else {
      denseDayStats.push(stat);
    }
  });

  return denseDayStats;
}

function fillMissingMonths(sparseMonthStats, statsMoment) {
  const denseMonthStats = [];

  let maxMonths;
  // Dont fill in months which exist in the future
  if (statsMoment.year() === moment().year()) {
    maxMonths = moment().month() + 1; // API months are 1 based
  } else {
    maxMonths = 12;
  }

  // Fill in any missing months up to the max amount
  Array.from({ length: maxMonths }, (x, i) => i + 1).forEach((m) => {
    const stat = sparseMonthStats.month_list.find((i) => i.month === m);

    if (stat === undefined) {
      denseMonthStats.push({
        year: statsMoment.year(),
        month: m,
        energy: 0,
      });
    } else {
      denseMonthStats.push(stat);
    }
  });

  return denseMonthStats;
}

function trimStatResults(stats, maxSamples) {
  return stats.splice(stats.length - maxSamples, stats.length);
}

function getCachedData(cache, deviceId) {
  const cacheEntry = cache.find((d) => d.deviceId == deviceId);
  if (cacheEntry === undefined) {
    return cacheEntry;
  }

  return cacheEntry.data;
}

function updateCache(cache, deviceId, data) {
  const cachedData = cache.find((d) => d.deviceId == deviceId);

  if (cachedData === undefined) {
    cache.push({
      deviceId,
      data,
    });
  } else {
    cachedData.data = data;
  }
}

/*
* On older firmware versions (not sure exactly which since its not documented anywhere)
* voltage seems to be reported as its peak to peak value, not RMS.
* So we show the RMS value since thats what would you expect to see.
* i.e. 220v not 310v (in the U.K).
* This is applied for all 1.0.x firmware versions.
*/
function normaliseVoltage(response, device) {
  if (device.softwareVersion.startsWith('1.0')) {
    return response.voltage / Math.sqrt(2);
  }

  return response.voltage;
}

module.exports.getCachedData = function (deviceId) {
  return {
    realtimeUsage: getCachedData(cachedRealtimeUsageData, deviceId),
    dailyUsage: getCachedData(cachedDailyUsageData, deviceId),
    monthlyUsage: getCachedData(cachedMonthlyUsageData, deviceId),
    powerState: getCachedData(cachedPowerState, deviceId),
  };
};
