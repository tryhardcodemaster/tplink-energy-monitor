import { NetworkInterfaceBase, networkInterfaces } from 'os';
import { TpPlug } from './types/tp-plug.type';

const { Client } = require('tplink-smarthome-api');
const dataLogger = require('./data-logger');

const interfaces = networkInterfaces();

const devices: TpPlug[] = [];

function registerPlug(plug: TpPlug) {
  if (plug.supportsEmeter) {
    console.log(`Found device with energy monitor support: ${plug.alias} [${plug.deviceId}]`);
    if (!devices.includes(plug)) {
      devices.push(plug);
      dataLogger.startLogging(plug);
    }
  } else {
    console.log(`Skipping device: ${plug.alias} [${plug.deviceId}]. Energy monitoring not supported.`);
  }
}

function startDiscovery(bindAddress: string) {
  console.log(`Starting discovery on interface: ${bindAddress}`);
  const client = new Client();
  client
    .startDiscovery({
      deviceTypes: ['plug'],
      address: bindAddress,
      discoveryTimeout: 20000,
    })
    .on('plug-new', registerPlug);
}

export const searchAllDevices = () => {
  Object.keys(interfaces)
    .reduce((results: NetworkInterfaceBase[], name) => results.concat(interfaces[name] || []), [])
    // @ts-ignore
    .filter((iface) => iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address)
    .map(startDiscovery);
};

export const getDevice = (deviceId: string) => devices.find((d) => d.deviceId === deviceId);

export const getAllDevices = () => devices;
