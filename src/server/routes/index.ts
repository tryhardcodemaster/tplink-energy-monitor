import { Request, Response } from 'express';
import { TpPlug } from '../services/types/tp-plug.type';
import express = require('express');

const router = express.Router();

const deviceManager = require('../services/device-manager');

deviceManager.searchAllDevices();

function sortDevices(devices: TpPlug[]) {
  return devices.slice().sort((a, b) => a.alias.toLowerCase().localeCompare(b.alias.toLowerCase()));
}

router.get('/', (req: Request, res: Response) => {
  const devices = sortDevices(deviceManager.getAllDevices());
  res.render('home', {
    devices,
  });
});

router.get('/settings', (req: Request, res: Response) => {
  res.render('settings', {
    deviceManager,
    devices: sortDevices(deviceManager.getAllDevices()),
  });
});

router.get('/:deviceId', (req: Request, res: Response) => {
  let { deviceId } = req.params;
  deviceId = deviceManager.getDevice(deviceId);

  if (deviceId) {
    res.render('device-view', {
      device: deviceId,
      devices: sortDevices(deviceManager.getAllDevices()),
    });
  } else {
    res.redirect('/');
  }
});

module.exports = router;
