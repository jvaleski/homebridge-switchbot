/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * plug.ts: @switchbot/homebridge-switchbot.
 */
import { request } from 'undici';
import { deviceBase } from './device.js';
import { SwitchBotPlatform } from '../platform.js';
import { Subject, debounceTime, interval, skipWhile, take, tap } from 'rxjs';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { device, devicesConfig, serviceData, deviceStatus, Devices } from '../settings.js';

export class Fan extends deviceBase {
  // Services
  private Fan: {
    Service: Service;
    Active: CharacteristicValue;
    SwingMode: CharacteristicValue;
    RotationSpeed: CharacteristicValue;
  };

  private Battery: {
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
    ChargingState: CharacteristicValue;
  };

  // Updates
  plugUpdateInProgress!: boolean;
  doPlugUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doPlugUpdate = new Subject();
    this.plugUpdateInProgress = false;

    // Initialize Fan property
    this.Fan = {
      Service: accessory.getService(this.hap.Service.Fanv2) as Service,
      Active: accessory.context.Active || this.hap.Characteristic.Active.INACTIVE,
      SwingMode: accessory.context.SwingMode || this.hap.Characteristic.SwingMode.SWING_DISABLED,
      RotationSpeed: accessory.context.RotationSpeed || 0,
    };

    // Initialize Battery property
    this.Battery = {
      Service: accessory.getService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel || 100,
      StatusLowBattery: accessory.context.StatusLowBattery || this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      ChargingState: accessory.context.ChargingState || this.hap.Characteristic.ChargingState.NOT_CHARGING,
    };

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // get the Fan service if it exists, otherwise create a new Fanv2 service
    // you can create multiple services for each accessory
    const FanService = `${accessory.displayName} ${device.deviceType}`;
    (this.Fan.Service = accessory.getService(this.hap.Service.Fanv2)
      || accessory.addService(this.hap.Service.Fanv2)), FanService;

    this.Fan.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Fanv2

    // create handlers for required characteristics
    this.Fan.Service.getCharacteristic(this.hap.Characteristic.Active).onSet(this.ActiveSet.bind(this));
    // create handlers for required characteristics
    this.Fan.Service.getCharacteristic(this.hap.Characteristic.RotationSpeed).onSet(this.RotationSpeedSet.bind(this));
    // create handlers for required characteristics
    this.Fan.Service.getCharacteristic(this.hap.Characteristic.SwingMode).onSet(this.SwingModeSet.bind(this));

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.plugUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (device.webhook) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { version, battery, powerState, oscillation, chargingStatus, fanSpeed } = context;
          const { Active, SwingMode, RotationSpeed } = this.Fan;
          const { BatteryLevel, ChargingState } = this.Battery;
          const { FirmwareRevision } = this.accessory.context;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(version, battery, powerState, oscillation, chargingStatus, fanSpeed) = '
            + `Webhook:(${version}, ${battery}, ${powerState}, ${oscillation}, ${chargingStatus}, ${fanSpeed}), `
            + `current:(${FirmwareRevision}, ${BatteryLevel}, ${Active}, ${SwingMode}, ${ChargingState}, ${RotationSpeed})`);

          // Active
          this.Fan.Active = powerState === 'ON' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE;

          // SwingMode
          this.Fan.SwingMode = oscillation === 'on' ?
            this.hap.Characteristic.SwingMode.SWING_ENABLED : this.hap.Characteristic.SwingMode.SWING_DISABLED;

          // RotationSpeed
          this.Fan.RotationSpeed = fanSpeed;

          // ChargingState
          this.Battery.ChargingState = chargingStatus === 'charging' ?
            this.hap.Characteristic.ChargingState.CHARGING : this.hap.Characteristic.ChargingState.NOT_CHARGING;

          // BatteryLevel
          this.Battery.BatteryLevel = battery;

          // Firmware Version
          if (version) {
            this.accessory.context.version = version;
            this.accessory
              .getService(this.hap.Service.AccessoryInformation)!
              .setCharacteristic(this.hap.Characteristic.FirmwareRevision, this.accessory.context.version)
              .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
              .updateValue(this.accessory.context.version);
          }
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }

    // Watch for Plug change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doPlugUpdate
      .pipe(
        tap(() => {
          this.plugUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.plugUpdateInProgress = false;
      });
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);

    // State
    switch (serviceData.state) {
      case 'on':
        this.Fan.Active = true;
        break;
      default:
        this.Fan.Active = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Fan.Active}`);
  }

  async openAPIparseStatus(deviceStatus: deviceStatus) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);

    // Active
    this.Fan.Active = deviceStatus.body.power === 'on' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.Fan.Active}`);

    // SwingMode
    this.Fan.SwingMode = deviceStatus.body.oscillation === 'on' ?
      this.hap.Characteristic.SwingMode.SWING_ENABLED : this.hap.Characteristic.SwingMode.SWING_DISABLED;

    // RotationSpeed
    this.Fan.RotationSpeed = deviceStatus.body.fanSpeed;

    // ChargingState
    this.Battery.ChargingState = deviceStatus.body.chargingStatus === 'charging' ?
      this.hap.Characteristic.ChargingState.CHARGING : this.hap.Characteristic.ChargingState.NOT_CHARGING;

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
    } else if (this.BLE) {
      await this.BLERefreshStatus();
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
      // Start to monitor advertisement packets
      await switchbot.startScan({ model: this.device.bleModel, id: this.device.bleMac });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        if (this.device.bleMac === ad.address && ad.model === this.device.bleModel) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.model}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 10 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus(switchbot.onadvertisement.serviceData);
      await this.updateHomeKitCharacteristics();
    })();
    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
        `${Devices}/${this.device.deviceId}/status`, { headers: this.platform.generateHeaders() });
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
   * commandType	 command                 parameter	                               Description
   * "command"     "turnOff"               "default"	                           =   set to OFF state
   * "command"     "turnOn"                "default"	                           =   set to ON state
   * "command"     "setNightLightMode"     "off, 1, or 2"                        =   off, turn off nightlight, (1, bright) (2, dim)
   * "command"     "setWindMode"           "direct, natural, sleep, or baby"     =   Set fan mode
   * "command"     "setWindSpeed"          "{1-100} e.g. 10"                     =   Set fan speed 1~100
   */

  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
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
      .pipe(skipWhile(() => this.plugUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    if (this.Fan.Active !== this.accessory.context.Active) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`
        + ` On: ${this.Fan.Active} OnCached: ${this.accessory.context.Active}`);
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      switchbot
        .discover({
          model: this.device.bleModel,
          id: this.device.bleMac,
        })
        .then(async (device_list: any) => {
          this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Fan.Active}`);
          return await this.retryBLE({
            max: await this.maxRetryBLE(),
            fn: async () => {
              if (this.Fan.Active) {
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
            + `Active: ${this.Fan.Active} sent over BLE,  sent successfully`);
          this.Fan.Active = false;
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
        + ` Active: ${this.Fan.Active}, ActiveCached: ${this.accessory.context.Active}`);
    }
  }

  async openAPIpushChanges() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.Fan.Active !== this.accessory.context.Active) {
      let command = '';
      if (this.Fan.Active) {
        command = 'turnOn';
      } else {
        command = 'turnOff';
      }
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      });
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
            + `request to SwitchBot API, body: ${JSON.stringify(deviceStatus)} sent successfully`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.`
        + `On: ${this.Fan.Active}, ActiveCached: ${this.accessory.context.Active}`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async ActiveSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.Active === this.accessory.context.Active) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Active: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Active: ${value}`);
    }

    this.Fan.Active = value;
    this.doPlugUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.RotationSpeed === this.accessory.context.RotationSpeed) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set RotationSpeed: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set RotationSpeed: ${value}`);
    }

    this.Fan.RotationSpeed = value;
    this.doPlugUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async SwingModeSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.SwingMode === this.accessory.context.SwingMode) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set SwingMode: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set SwingMode: ${value}`);
    }

    this.Fan.SwingMode = value;
    this.doPlugUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // Active
    if (this.Fan.Active === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.Fan.Active}`);
    } else {
      this.accessory.context.Active = this.Fan.Active;
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, this.Fan.Active);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Fan.Active}`);
    }
    // RotationSpeed
    if (this.Fan.RotationSpeed === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} RotationSpeed: ${this.Fan.RotationSpeed}`);
    } else {
      this.accessory.context.RotationSpeed = this.Fan.RotationSpeed;
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, this.Fan.RotationSpeed);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.Fan.RotationSpeed}`);
    }
    // SwingMode
    if (this.Fan.SwingMode === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} SwingMode: ${this.Fan.SwingMode}`);
    } else {
      this.accessory.context.SwingMode = this.Fan.SwingMode;
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, this.Fan.SwingMode);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic SwingMode: ${this.Fan.SwingMode}`);
    }
    // BateryLevel
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
    // ChargingState
    if (this.Battery.ChargingState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ChargingState: ${this.Battery.ChargingState}`);
    } else {
      this.accessory.context.ChargingState = this.Battery.ChargingState;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.ChargingState, this.Battery.ChargingState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic ChargingState: ${this.Battery.ChargingState}`);
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
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, 0);
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, this.hap.Characteristic.SwingMode.SWING_DISABLED);
    }
  }

  async apiError(e: any): Promise<void> {
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e);
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, e);
  }
}
