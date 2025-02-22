/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * robotvacuumcleaner.ts: @switchbot/homebridge-switchbot.
 */
import { request } from 'undici';
import { Subject, interval, skipWhile } from 'rxjs';
import { deviceBase } from './device.js';
import { SwitchBotPlatform } from '../platform.js';
import { debounceTime, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, deviceStatus, serviceData, Devices } from '../settings.js';

export class RobotVacuumCleaner extends deviceBase {
  // Services
  private LightBulb: {
    Service: Service;
    On: CharacteristicValue;
    Brightness: CharacteristicValue;
  };

  private Battery: {
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
  };

  // Updates
  robotVacuumCleanerUpdateInProgress!: boolean;
  doRobotVacuumCleanerUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doRobotVacuumCleanerUpdate = new Subject();
    this.robotVacuumCleanerUpdateInProgress = false;

    // Initialize Lightbulb property
    this.LightBulb = {
      Service: accessory.getService(this.hap.Service.Lightbulb) as Service,
      On: accessory.context.On || false,
      Brightness: accessory.context.Brightness || 0,
    };

    // Initialize Battery property
    this.Battery = {
      Service: accessory.getService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel || 100,
      StatusLowBattery: accessory.context.StatusLowBattery || this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    };

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // get the Lightbulb service if it exists, otherwise create a new Lightbulb service
    // you can create multiple services for each accessory
    const LightBulbService = `${accessory.displayName} ${device.deviceType}`;
    (this.LightBulb.Service = accessory.getService(this.hap.Service.Lightbulb)
      || accessory.addService(this.hap.Service.Lightbulb)), LightBulbService;

    this.LightBulb.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // create handlers for required characteristics
    this.LightBulb.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));

    // handle Brightness events using the Brightness characteristic
    this.LightBulb.Service
      .getCharacteristic(this.hap.Characteristic.Brightness)
      .setProps({
        minStep: 25,
        minValue: 0,
        maxValue: 100,
        validValues: [0, 25, 50, 75, 100],
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.LightBulb.Brightness;
      })
      .onSet(this.BrightnessSet.bind(this));

    // Battery Service
    const BatteryService = `${accessory.displayName} Battery`;
    (this.Battery.Service = this.accessory.getService(this.hap.Service.Battery)
      || accessory.addService(this.hap.Service.Battery)), BatteryService;

    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, BatteryService);

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.robotVacuumCleanerUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (device.webhook) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { onlineStatus, battery } = context;
          const { On } = this.LightBulb;
          const { BatteryLevel } = this.Battery;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(onlineStatus, battery) = ' +
            `Webhook:(${onlineStatus}, ${battery}), ` +
            `current:(${On}, ${BatteryLevel})`);
          this.LightBulb.On = onlineStatus === 'online' ? true : false;
          this.Battery.BatteryLevel = battery;
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }

    // Watch for Plug change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doRobotVacuumCleanerUpdate
      .pipe(
        tap(() => {
          this.robotVacuumCleanerUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          if (this.LightBulb.On !== this.accessory.context.On) {
            await this.pushChanges();
          }
          if (this.LightBulb.On && this.LightBulb.Brightness !== this.accessory.context.Brightness) {
            await this.openAPIpushBrightnessChanges();
          }
        } catch (e: any) {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.robotVacuumCleanerUpdateInProgress = false;
      });
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);

    // Battery
    this.Battery.BatteryLevel = Number(serviceData.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}, StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // State
    switch (serviceData.state) {
      case 'on':
        this.LightBulb.On = true;
        break;
      default:
        this.LightBulb.On = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.LightBulb.On}`);
  }

  async openAPIparseStatus(deviceStatus: deviceStatus) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    switch (deviceStatus.body.power) {
      case 'on':
        this.LightBulb.On = true;
        break;
      default:
        this.LightBulb.On = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.LightBulb.On}`);

    // BatteryLevel
    this.Battery.BatteryLevel = Number(deviceStatus.body.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.Battery.BatteryLevel)) {
      this.Battery.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel},`
      + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // Firmware Version
    const version = deviceStatus.body.version?.toString();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
    if (deviceStatus.body.version) {
      this.accessory.context.version = version?.replace(/^V|-.*$/g, '');
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, this.accessory.context.version)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(this.accessory.context.version);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus enableCloudService: ${this.device.enableCloudService}`);
      /*} else if (this.BLE) {
        await this.BLERefreshStatus();*/
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` +
        ` ${this.device.connectionType}, refreshStatus will not happen.`,
      );
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    (async () => {
      await switchbot.startScan({
        model: '?',
        id: this.device.bleMac,
      });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.serviceData.model}`);
        if (this.device.bleMac === ad.address && ad.serviceData.model === '?') {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 1 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus(switchbot.onadvertisement.serviceData);
      await this.updateHomeKitCharacteristics();
    })();
    /*if (switchbot !== false) {
      switchbot
        .startScan({
          model: this.BLEmodel(),
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event handler
          switchbot.onadvertisement = async (ad: ad) => {
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},` +
              ` BLE Address Found: ${ad.address}`,
            );
            serviceData.state = ad.serviceData.state;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} state: ${ad.serviceData.state}, ` +
              `delay: ${ad.serviceData.delay}, timer: ${ad.serviceData.timer}, syncUtcTime: ${ad.serviceData.syncUtcTime} ` +
              `wifiRssi: ${ad.serviceData.wifiRssi}, overload: ${ad.serviceData.overload}, currentPower: ${ad.serviceData.currentPower}`,
            );

            if (ad.serviceData) {
              this.BLE_IsConnected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
              await this.stopScanning(switchbot);
            } else {
              this.BLE_IsConnected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
            }
          };
          // Wait
          return await sleep(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }*/
  }

  async openAPIRefreshStatus() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
        `${Devices}/${this.device.deviceId}/status`, {
          headers: this.platform.generateHeaders(),
        });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.openAPIparseStatus(deviceStatus);
        this.updateHomeKitCharacteristics();
      } else {
        this.statusCode(statusCode);
        this.statusCode(deviceStatus.statusCode);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(
        `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}` +
        ` Connection, Error Message: ${JSON.stringify(e.message)}`,
      );
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	              commandType	    Command	    parameter	        Description
   * Robot Vacuum Cleaner S1   "command"     "start"      "default"	  =     start vacuuming
   * Robot Vacuum Cleaner S1   "command"     "stop"       "default"	  =     stop vacuuming
   * Robot Vacuum Cleaner S1   "command"     "dock"       "default"   =     return to charging dock
   * Robot Vacuum Cleaner S1   "command"     "PowLevel"   "{0-3}"     =     set suction power level: 0 (Quiet), 1 (Standard), 2 (Strong), 3 (MAX)
   */

  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
      /*} else if (this.BLE) {
        await this.BLEpushChanges();*/
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, pushChanges will not happen.`,
      );
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.robotVacuumCleanerUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    if (this.LightBulb.On !== this.accessory.context.On) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`
        + ` On: ${this.LightBulb.On} OnCached: ${this.accessory.context.On}`);
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      switchbot
        .discover({
          model: '?',
          id: this.device.bleMac,
        })
        .then(async (device_list: any) => {
          this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.LightBulb.On}`);
          return await this.retryBLE({
            max: await this.maxRetryBLE(),
            fn: async () => {
              if (this.LightBulb.On) {
                return await device_list[0].turnOn({ id: this.device.bleMac });
              } else {
                return await device_list[0].turnOff({ id: this.device.bleMac });
              }
            },
          });
        })
        .then(() => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `On: ${this.LightBulb.On} sent over BLE,  sent successfully`);
          this.LightBulb.On = false;
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLEPushConnection();
        });
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges,`
        + ` On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  async openAPIpushChanges() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.LightBulb.On !== this.accessory.context.On) {
      const bodyChange = await this.commands();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `request to SwitchBot API, body: ${JSON.stringify(bodyChange)} sent successfully`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.` +
        `On: ${this.LightBulb.On}, ` +
        `OnCached: ${this.accessory.context.On}`,
      );
    }
  }

  async openAPIpushBrightnessChanges() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushBrightnessChanges`);
    const bodyChange = await this.brightnessCommands();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
    try {
      const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
        body: bodyChange,
        method: 'POST',
        headers: this.platform.generateHeaders(),
      });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `request to SwitchBot API, body: ${JSON.stringify(deviceStatus)} sent successfully`);
      } else {
        this.statusCode(statusCode);
        this.statusCode(deviceStatus.statusCode);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(
        `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}` +
        ` Connection, Error Message: ${JSON.stringify(e.message)}`,
      );
    }
  }

  async commands() {
    let command: string;
    let parameter: string;
    if (this.LightBulb.On) {
      command = 'start';
      parameter = 'default';
    } else {
      command = 'dock';
      parameter = 'default';
    }
    const body = JSON.stringify({
      command: `${command}`,
      parameter: `${parameter}`,
      commandType: 'command',
    });
    return body;
  }

  async brightnessCommands(): Promise<string> {
    let command: string;
    let parameter: string;
    if (this.LightBulb.Brightness === 25) {
      command = 'PowLevel';
      parameter = '0';
    } else if (this.LightBulb.Brightness === 50) {
      command = 'PowLevel';
      parameter = '1';
    } else if (this.LightBulb.Brightness === 75) {
      command = 'PowLevel';
      parameter = '2';
    } else if (this.LightBulb.Brightness === 100) {
      command = 'PowLevel';
      parameter = '3';
    } else {
      command = 'dock';
      parameter = 'default';
    }
    const bodyChange = JSON.stringify({
      command: `${command}`,
      parameter: `${parameter}`,
      commandType: 'command',
    });
    return bodyChange;
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On === this.accessory.context.On) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set On: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set On: ${value}`);
    }

    this.LightBulb.On = value;
    this.doRobotVacuumCleanerUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.Brightness === this.accessory.context.Brightness) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Brightness: ${value}`);
    } else if (this.LightBulb.On) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Brightness: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Brightness: ${value}`);
    }

    this.LightBulb.Brightness = value;
    this.doRobotVacuumCleanerUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // On
    if (this.LightBulb.On === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.LightBulb.On}`);
    } else {
      this.accessory.context.On = this.LightBulb.On;
      this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, this.LightBulb.On);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.LightBulb.On}`);
    }
    // Brightness
    if (this.LightBulb.Brightness === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Brightness: ${this.LightBulb.Brightness}`);
    } else {
      this.accessory.context.Brightness = this.LightBulb.Brightness;
      this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Brightness, this.LightBulb.Brightness);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Brightness: ${this.LightBulb.Brightness}`);
    }
    // BatteryLevel
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery.Service?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
    // StatusLowBattery
    if (this.Battery.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    } else {
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    }
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Push Changes`);
      await this.openAPIpushChanges();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot:`
      + ` ${JSON.stringify(switchbot)}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, false);
    }
  }

  async apiError(e: any): Promise<void> {
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, e);
  }
}
