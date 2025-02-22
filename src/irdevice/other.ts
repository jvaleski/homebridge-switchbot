/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * other.ts: @switchbot/homebridge-switchbot.
 */
import { request } from 'undici';
import { irdeviceBase } from './irdevice.js';
import { SwitchBotPlatform } from '../platform.js';
import { Devices, irDevicesConfig, irdevice } from '../settings.js';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Others extends irdeviceBase {
  // Services
  private Switch?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private GarageDoor?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Door?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Window?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private WindowCovering?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Lock?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Faucet?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Fan?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private StatefulProgrammableSwitch?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Outlet?: {
    Service: Service;
    On: CharacteristicValue;
  };

  // Config
  otherDeviceType?: string;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // default placeholders
    this.getOtherConfigSettings(device);

    // deviceType
    if (this.otherDeviceType === 'switch') {
      // Initialize Switch property
      this.Switch = {
        Service: accessory.getService(this.hap.Service.Switch) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add Switch Service
      const SwitchService = `${accessory.displayName} Switch`;
      (this.Switch!.Service = accessory.getService(this.hap.Service.Switch) as Service
        || accessory.addService(this.hap.Service.Switch)), SwitchService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Switch`);

      this.Switch!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Switch!.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (this.otherDeviceType === 'garagedoor') {
      // Initialize Garage Door property
      this.GarageDoor = {
        Service: accessory.getService(this.hap.Service.GarageDoorOpener) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add GarageDoor Service
      const GarageDoorService = `${accessory.displayName} Garage Door Opener`;
      (this.GarageDoor!.Service = accessory.getService(this.hap.Service.GarageDoorOpener) as Service
        || accessory.addService(this.hap.Service.GarageDoorOpener)), GarageDoorService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Garage Door Opener`);

      this.GarageDoor!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.GarageDoor!.Service.getCharacteristic(this.hap.Characteristic.TargetDoorState).onSet(this.OnSet.bind(this));
      this.GarageDoor!.Service.setCharacteristic(this.hap.Characteristic.ObstructionDetected, false);
    } else if (this.otherDeviceType === 'door') {
      // Initialize Door property
      this.Door = {
        Service: accessory.getService(this.hap.Service.Door) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add Door Service
      const DoorService = `${accessory.displayName} Door`;
      (this.Door!.Service = accessory.getService(this.hap.Service.Door) as Service
        || accessory.addService(this.hap.Service.Door)), DoorService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Door`);

      this.Door!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Door!.Service
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.Door!.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
    } else if (this.otherDeviceType === 'window') {
      // Initialize Window property
      this.Window = {
        Service: accessory.getService(this.hap.Service.Window) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add Window Service
      const WindowService = `${accessory.displayName} Window`;
      (this.Window!.Service = accessory.getService(this.hap.Service.Window) as Service
        || accessory.addService(this.hap.Service.Window)), WindowService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Window`);

      this.Window!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Window!.Service
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.Window!.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
    } else if (this.otherDeviceType === 'windowcovering') {
      // Initialize WindowCovering property
      this.WindowCovering = {
        Service: accessory.getService(this.hap.Service.WindowCovering) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add WindowCovering Service
      const WindowCoveringService = `${accessory.displayName} Window Covering`;
      (this.WindowCovering!.Service = accessory.getService(this.hap.Service.WindowCovering) as Service
        || accessory.addService(this.hap.Service.WindowCovering)), WindowCoveringService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Window Covering`);

      this.WindowCovering!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.WindowCovering!.Service
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.WindowCovering!.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
    } else if (this.otherDeviceType === 'lock') {
      // Initialize Lock property
      this.Lock = {
        Service: accessory.getService(this.hap.Service.LockMechanism) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeFaucetService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add Lock Service
      const LockService = `${accessory.displayName} Lock`;
      (this.Lock!.Service = accessory.getService(this.hap.Service.LockMechanism) as Service
        || accessory.addService(this.hap.Service.LockMechanism)), LockService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Lock`);

      this.Lock!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Lock!.Service.getCharacteristic(this.hap.Characteristic.LockTargetState).onSet(this.OnSet.bind(this));
    } else if (this.otherDeviceType === 'faucet') {
      // Initialize Faucet property
      this.Faucet = {
        Service: accessory.getService(this.hap.Service.Faucet) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add Faucet Service
      const FaucetService = `${accessory.displayName} Faucet`;
      (this.Faucet!.Service = accessory.getService(this.hap.Service.Faucet) as Service
        || accessory.addService(this.hap.Service.Faucet)), FaucetService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Faucet`);

      this.Faucet!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Faucet!.Service.getCharacteristic(this.hap.Characteristic.Active).onSet(this.OnSet.bind(this));
    } else if (this.otherDeviceType === 'fan') {
      // Initialize Fan property
      this.Fan = {
        Service: accessory.getService(this.hap.Service.Fanv2) as Service,
        On: accessory.context.On || false,
      };
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add Fan Service
      const FanService = `${accessory.displayName} Fan`;
      (this.Fan!.Service = accessory.getService(this.hap.Service.Fanv2) as Service
        || accessory.addService(this.hap.Service.Fanv2)), FanService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Fan`);

      this.Fan!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Fan!.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (this.otherDeviceType === 'stateful') {
      // Initialize StatefulProgrammableSwitch property
      this.StatefulProgrammableSwitch = {
        Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);

      // Add StatefulProgrammableSwitch.Service
      const StatefulProgrammableSwitchService = `${accessory.displayName} Stateful Programmable Switch`;
      (this.StatefulProgrammableSwitch!.Service = accessory.getService(this.hap.Service.StatefulProgrammableSwitch) as Service
        || accessory.addService(this.hap.Service.StatefulProgrammableSwitch)), StatefulProgrammableSwitchService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Stateful Programmable Switch`);

      this.StatefulProgrammableSwitch!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.StatefulProgrammableSwitch!.Service
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onSet(this.OnSet.bind(this));
    } else {
      // Initialize Outlet property
      this.Outlet = {
        Service: accessory.getService(this.hap.Service.Outlet) as Service,
        On: accessory.context.On || false,
      };
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add Outlet.Service
      const OutletService = `${accessory.displayName} Outlet`;
      (this.Outlet!.Service = accessory.getService(this.hap.Service.Outlet) as Service
        || accessory.addService(this.hap.Service.Outlet)), OutletService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Outlet`);

      this.Outlet!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Outlet!.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    let On: boolean;
    if (this.otherDeviceType === 'garagedoor') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set TargetDoorState: ${value}`);
      if (value === this.hap.Characteristic.TargetDoorState.CLOSED) {
        this.GarageDoor!.On = false;
      } else {
        this.GarageDoor!.On = true;
      }
      On = this.GarageDoor!.On;
    } else if (this.otherDeviceType === 'door') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        this.Door!.On = false;
      } else {
        this.Door!.On = true;
      }
      On = this.Door!.On;
    } else if (this.otherDeviceType === 'window') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        this.Window!.On = false;
      } else {
        this.Window!.On = true;
      }
      On = this.Window!.On;
    } else if (this.otherDeviceType === 'windowcovering') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        this.WindowCovering!.On = false;
      } else {
        this.WindowCovering!.On = true;
      }
      On = this.WindowCovering!.On;
    } else if (this.otherDeviceType === 'lock') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set LockTargetState: ${value}`);
      if (value === this.hap.Characteristic.LockTargetState.SECURED) {
        this.Lock!.On = false;
      } else {
        this.Lock!.On = true;
      }
      On = this.Lock!.On;
    } else if (this.otherDeviceType === 'faucet') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Active: ${value}`);
      if (value === this.hap.Characteristic.Active.INACTIVE) {
        this.Faucet!.On = false;
      } else {
        this.Faucet!.On = true;
      }
      On = this.Faucet!.On;
    } else if (this.otherDeviceType === 'stateful') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set ProgrammableSwitchOutputState: ${value}`);
      if (value === 0) {
        this.StatefulProgrammableSwitch!.On = false;
      } else {
        this.StatefulProgrammableSwitch!.On = true;
      }

      On = this.StatefulProgrammableSwitch!.On;
    } else {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set On: ${value}`);
      this.Outlet!.On = value;
      On = this.Outlet!.On ? true : false;
    }

    //pushChanges
    if (On === true) {
      await this.pushOnChanges(On);
    } else {
      await this.pushOffChanges(On);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Other -        "command"       "turnOff"         "default"	        =        set to OFF state
   * Other -       "command"       "turnOn"          "default"	        =        set to ON state
   * Other -       "command"       "volumeAdd"       "default"	        =        volume up
   * Other -       "command"       "volumeSub"       "default"	        =        volume down
   * Other -       "command"       "channelAdd"      "default"	        =        next channel
   * Other -       "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushOnChanges(On: boolean): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushOnChanges On: ${On},`
      + ` disablePushOn: ${this.disablePushOn}, customize: ${this.device.customize}, customOn: ${this.device.customOn}`);
    if (this.device.customize) {
      if (On === true && !this.disablePushOn) {
        const commandType: string = await this.commandType();
        const command: string = await this.commandOn();
        const bodyChange = JSON.stringify({
          command: command,
          parameter: 'default',
          commandType: commandType,
        });
        await this.pushChanges(bodyChange);
      }
    } else {
      this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} On Command not set`);
    }
  }

  async pushOffChanges(On: boolean): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushOffChanges On: ${On},`
      + ` disablePushOff: ${this.disablePushOff}, customize: ${this.device.customize}, customOff: ${this.device.customOff}`);
    if (this.device.customize) {
      if (On === false && !this.disablePushOff) {
        const commandType: string = await this.commandType();
        const command: string = await this.commandOff();
        const bodyChange = JSON.stringify({
          command: command,
          parameter: 'default',
          commandType: commandType,
        });
        await this.pushChanges(bodyChange);
      }
    } else {
      this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Off Command not set.`);
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushChanges`);
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugSuccessLog(`${this.device.remoteType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.remoteType}: ${this.accessory.displayName}`
            + ` request to SwitchBot API, body: ${JSON.stringify(bodyChange)} sent successfully`);
          this.updateHomeKitCharacteristics();
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName}`
        + ` Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`);
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.otherDeviceType === 'garagedoor') {
      if (this.GarageDoor!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.GarageDoor!.On}`);
      } else {
        if (this.GarageDoor!.On) {
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.OPEN);
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.OPEN);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetDoorState: Open, CurrentDoorState: Open (${this.GarageDoor!.On})`);
        } else {
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.CLOSED);
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetDoorState: Closed, CurrentDoorState: Closed (${this.GarageDoor!.On})`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Garage Door On: ${this.GarageDoor!.On}`);
    } else if (this.otherDeviceType === 'door') {
      if (this.Door!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.Door!.On}`);
      } else {
        if (this.Door!.On) {
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.Door!.On})`);
        } else {
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.Door!.On})`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Door On: ${this.Door!.On}`);
    } else if (this.otherDeviceType === 'window') {
      if (this.Window!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.Window!.On}`);
      } else {
        if (this.Window!.On) {
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.Window!.On})`);
        } else {
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.Window!.On})`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Window On: ${this.Window!.On}`);
    } else if (this.otherDeviceType === 'windowcovering') {
      if (this.WindowCovering!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.WindowCovering!.On}`);
      } else {
        if (this.WindowCovering!.On) {
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.WindowCovering!.On})`);
        } else {
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.WindowCovering!.On})`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Window Covering On: ${this.WindowCovering!.On}`);
    } else if (this.otherDeviceType === 'lock') {
      if (this.Lock!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.Lock!.On}`);
      } else {
        if (this.Lock!.On) {
          this.Lock!.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.UNSECURED);
          this.Lock!.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.UNSECURED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` LockTargetState: UNSECURED, LockCurrentState: UNSECURE (${this.Lock!.On})`);
        } else {
          this.Lock!.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED);
          this.Lock!.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.SECURED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` LockTargetState: SECURED, LockCurrentState: SECURED (${this.Lock!.On})`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Lock On: ${this.Lock!.On}`);
    } else if (this.otherDeviceType === 'faucet') {
      if (this.Faucet!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.Faucet!.On}`);
      } else {
        if (this.Faucet!.On) {
          this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Faucet!.On}`);
        } else {
          this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Faucet!.On}`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Faucet On: ${this.Faucet!.On}`);
    } else if (this.otherDeviceType === 'fan') {
      if (this.Fan!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.Fan!.On}`);
      } else {
        if (this.Fan!.On) {
          this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Fan!.On);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Fan!.On}`);
        } else {
          this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Fan!.On);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Fan!.On}`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Fan On: ${this.Fan!.On}`);
    } else if (this.otherDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.StatefulProgrammableSwitch!.On}`);
      } else {
        if (this.StatefulProgrammableSwitch!.On) {
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 1);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 1 (${this.StatefulProgrammableSwitch!.On})`);
        } else {
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
            + ` ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 0 (${this.StatefulProgrammableSwitch!.On})`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} StatefulProgrammableSwitch On: ${this.StatefulProgrammableSwitch!.On}`);
    } else if (this.otherDeviceType === 'switch') {
      if (this.Switch!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.Switch!.On}`);
      } else {
        this.Switch!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Switch!.On);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Switch!.On}`);
      }
    } else {
      if (this.Outlet!.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.Outlet!.On}`);
      } else {
        this.Outlet!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Outlet!.On);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Outlet!.On}`);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.otherDeviceType === 'garagedoor') {
      this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, e);
      this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, e);
      this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, e);
    } else if (this.otherDeviceType === 'door') {
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'window') {
      this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'windowcovering') {
      this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'lock') {
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, e);
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e);
    } else if (this.otherDeviceType === 'faucet') {
      this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    } else if (this.otherDeviceType === 'fan') {
      this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, e);
    } else if (this.otherDeviceType === 'stateful') {
      this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
      this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
    } else if (this.otherDeviceType === 'switch') {
      this.Switch!.Service.updateCharacteristic(this.hap.Characteristic.On, e);
    } else {
      this.Outlet!.Service.updateCharacteristic(this.hap.Characteristic.On, e);
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If Outlet.Service still present, then remove first
    if (this.Outlet?.Service) {
      this.Outlet!.Service = this.accessory.getService(this.hap.Service.Outlet) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Outlet Service`);
      accessory.removeService(this.Outlet!.Service);
    }
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If GarageDoor.Service still present, then remove first
    if (this.GarageDoor?.Service) {
      this.GarageDoor!.Service = this.accessory.getService(this.hap.Service.GarageDoorOpener) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Garage Door Service`);
      accessory.removeService(this.GarageDoor!.Service);
    }
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If Door.Service still present, then remove first
    if (this.Door?.Service) {
      this.Door!.Service = this.accessory.getService(this.hap.Service.Door) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Door Service`);
      accessory.removeService(this.Door!.Service);
    }
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If Lock.Service still present, then remove first
    if (this.Lock?.Service) {
      this.Lock!.Service = this.accessory.getService(this.hap.Service.LockMechanism) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Lock Service`);
      accessory.removeService(this.Lock!.Service);
    }
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If Faucet.Service still present, then remove first
    if (this.Faucet?.Service) {
      this.Faucet!.Service = this.accessory.getService(this.hap.Service.Faucet) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Faucet Service`);
      accessory.removeService(this.Faucet!.Service);
    }
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If Fan Service still present, then remove first
    if (this.Fan?.Service) {
      this.Fan!.Service = this.accessory.getService(this.hap.Service.Fan) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Fan Service`);
      accessory.removeService(this.Fan!.Service);
    }
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If Window.Service still present, then remove first
    if (this.Window?.Service) {
      this.Window!.Service = this.accessory.getService(this.hap.Service.Window) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Window Service`);
      accessory.removeService(this.Window!.Service);
    }
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If WindowCovering.Service still present, then remove first
    if (this.WindowCovering?.Service) {
      this.WindowCovering!.Service = this.accessory.getService(this.hap.Service.WindowCovering) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Window Covering Service`);
      accessory.removeService(this.WindowCovering!.Service);
    }
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If StatefulProgrammableSwitch.Service still present, then remove first
    if (this.StatefulProgrammableSwitch?.Service) {
      this.StatefulProgrammableSwitch!.Service = this.accessory.getService(this.hap.Service.StatefulProgrammableSwitch) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Stateful Programmable Switch Service`);
      accessory.removeService(this.StatefulProgrammableSwitch!.Service);
    }
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If Switch.Service still present, then remove first
    if (this.Switch?.Service) {
      this.Switch!.Service = this.accessory.getService(this.hap.Service.Switch) as Service;
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Switch Service`);
      accessory.removeService(this.Switch!.Service);
    }
  }

  async getOtherConfigSettings(device: irdevice & irDevicesConfig): Promise<void> {
    if (!device.other?.deviceType && this.accessory.context.deviceType) {
      this.otherDeviceType = this.accessory.context.deviceType;
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Type: ${this.otherDeviceType}, from Accessory Cache.`);
    } else if (device.other?.deviceType) {
      this.accessory.context.deviceType = device.other.deviceType;
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Accessory Cache: ${this.accessory.context.deviceType}`);
      this.otherDeviceType = this.accessory.context.deviceType;
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Type: ${this.otherDeviceType}`);
    } else {
      this.otherDeviceType = 'outlet';
      this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName} no deviceType set, using default deviceType: ${this.otherDeviceType}`);
    }
  }
}
