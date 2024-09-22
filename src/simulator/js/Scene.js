import * as objTypes from './objTypes.js';
import { versionUpdate } from './versionUpdate.js';
import { getMsg } from './translations.js';

/**
 * The version of the JSON data format of the scene, which matches the major version number of the app starting from version 5.0.
 * @const {number}
 */
export const DATA_VERSION = 5;

/**
 * Represents the scene in this simulator.
 * @class Scene
 * @property {string} name - The name of the scene.
 * @property {Object<string,import('./objs/special/ModuleObj.js').ModuleDef>} modules - The definitions of modules used in the scene.
 * @property {Array<import('./objs/BaseSceneObj.js').BaseSceneObj>} objs - The objects (optical elements and/or decorations created by the user with "Tools") in the scene.
 * @property {string} mode - The mode of the scene. Possible values: 'rays' (Rays), 'extended' (Extended Rays), 'images' (All Images), 'observer' (Seen by Observer).
 * @property {number} rayModeDensity - The density of rays in 'rays' and 'extended' modes.
 * @property {number} imageModeDensity - The density of rays in 'images' and 'observer' modes.
 * @property {boolean} showGrid - The "Grid" option indicating if the grid is visible.
 * @property {boolean} snapToGrid - The "Snap to Grid" option indicating if mouse actions are snapped to the grid.
 * @property {boolean} lockObjs - The "Lock Objects" option indicating if the objects are locked.
 * @property {number} gridSize - The size of the grid.
 * @property {Circle|null} observer - The observer of the scene, null if not set.
 * @property {number} lengthScale - The length scale used in line width, default font size, etc in the scene.
 * @property {import('./geometry.js').Point} origin - The origin of the scene in the viewport.
 * @property {number} scale - The scale factor (the viewport CSS pixel per internal length unit) of the scene.
 * @property {number} width - The width (in CSS pixels) of the viewport.
 * @property {number} height - The height (in CSS pixels) of the viewport.
 * @property {boolean} simulateColors - The "Simulate Color" option indicating if the color (wavelength) of the rays is simulated (also affecting whether the options of color filtering or Cauchy coefficients of some objects are shown.)
 * @property {boolean} symbolicBodyMerging - The "Symbolic body-merging" option in the gradient-index glass objects (which is a global option), indicating if the symbolic math is used to calculate the effective refractive index resulting from the "body-merging" of several gradient-index glass objects.
 * @property {Object|null} backgroundImage - The background image of the scene, null if not set.
 */
export class Scene {
  static serializableDefaults = {
    name: '',
    modules: {},
    objs: [],
    mode: 'rays',
    rayModeDensity: 0.1,
    imageModeDensity: 1,
    showGrid: false,
    snapToGrid: false,
    lockObjs: false,
    gridSize: 20,
    observer: null,
    lengthScale: 1,
    origin: { x: 0, y: 0 },
    scale: 1,
    width: 1500,
    height: 900,
    simulateColors: false,
    symbolicBodyMerging: false
  };

  constructor() {
    this.backgroundImage = null;
    this.error = null;
    this.warning = null;
    this.loadJSON(JSON.stringify({ version: DATA_VERSION }), () => { });
  }

  /**
  * Set the size (in CSS pixels) for the viewport of the scene.
  * @method setViewportSize
  * @param {number} width
  * @param {number} height
  */
  setViewportSize(width, height) {
    this.width = width;
    this.height = height;
  }


  /** @property {number} rayDensity - The mode-dependent ray density. */
  get rayDensity() {
    return this.mode == 'rays' || this.mode == 'extended' ? this.rayModeDensity : this.imageModeDensity;
  }

  set rayDensity(val) {
    if (this.mode == 'rays' || this.mode == 'extended') {
      this.rayModeDensity = val;
    } else {
      this.imageModeDensity = val;
    }
  }

  /** @property {Array<import('./objs/BaseSceneObj.js').BaseSceneObj>} opticalObjs - The objects in the scene which are optical. Module objects are expanded recursively. If the user edits only the non-optical part of the scene, then the content of this array will not change. */
  get opticalObjs() {
    function expandObjs(objs) {
      let expandedObjs = [];
      for (let obj of objs) {
        if (obj.constructor === objTypes['ModuleObj']) {
          expandedObjs = expandedObjs.concat(expandObjs(obj.objs));
        } else {
          expandedObjs.push(obj);
        }
      }
      return expandedObjs;
    }

    return expandObjs(this.objs).filter(obj => obj.constructor.isOptical);
  }

  /**
   * The callback function when the entire scene or a resource (e.g. image) is loaded.
   * @callback loadJSONCallback
   * @param {boolean} needFullUpdate - Whether the scene needs a full update.
   * @param {boolean} completed - Whether the scene is completely loaded.
   */

  /**
  * Load the scene from JSON.
  * @param {string} json
  * @param {loadJSONCallback} callback - The callback function when the entire scene or a resource (e.g. image) is loaded.
  */
  loadJSON(json, callback) {
    this.error = null;
    this.warning = null;
    try {
      let jsonData = JSON.parse(json);

      // Convert the scene from old versions if necessary.
      if (!jsonData.version || jsonData.version < DATA_VERSION) {
        jsonData = versionUpdate(jsonData);
      } else if (jsonData.version > DATA_VERSION) {
        // Newer than the current version
        throw new Error('The version of the scene is newer than the current version of the simulator.');
      }

      const serializableDefaults = Scene.serializableDefaults;

      const originalWidth = this.width || serializableDefaults.width;
      const originalHeight = this.height || serializableDefaults.height;

      // Take the approximated size of the current viewport, which may be different from that of the scene to be loaded.
      const approximatedWidth = Math.ceil(originalWidth / 100) * 100;
      const approximatedHeight = Math.ceil(originalHeight / 100) * 100;

      // Set the properties of the scene. Use the default properties if the JSON data does not contain them.
      for (let key in serializableDefaults) {
        if (!(key in jsonData)) {
          jsonData[key] = JSON.parse(JSON.stringify(serializableDefaults[key]));
        }
        this[key] = jsonData[key];
      }

      // Rescale the scene to fit the current viewport.
      let rescaleFactor = 1;

      if (jsonData.width / jsonData.height > approximatedWidth / approximatedHeight) {
        rescaleFactor = jsonData.width / approximatedWidth;
      } else {
        rescaleFactor = jsonData.height / approximatedHeight;
      }

      this.scale = jsonData.scale / rescaleFactor;
      this.origin.x = jsonData.origin.x / rescaleFactor;
      this.origin.y = jsonData.origin.y / rescaleFactor;
      this.width = originalWidth;
      this.height = originalHeight;

      // Load the objects in the scene.
      this.objs = jsonData.objs.map(objData =>
        new objTypes[objData.type](this, objData)
      );

      // Load the background image.
      if (jsonData.backgroundImage) {
        this.backgroundImage = new Image();
        this.backgroundImage.src = "../gallery/" + jsonData.backgroundImage;
        this.backgroundImage.onload = function (e1) {
          callback(false, true);
        }
        callback(true, false);
      } else {
        // The JSON data does not contain the background image. Currently this does not mean that we should clear the background image (as the undo/redo history does not currently store it). However, this may change in the future.
        callback(true, true);
      }
    } catch (e) {
      this.error = e.toString();
      this.objs = [];
      callback(true, true);
    }
  }

  /**
   * Convert the scene to JSON.
   * @method toJSON
   * @returns {string} The JSON string representing the scene.
   */
  toJSON() {
    let jsonData = { version: DATA_VERSION };

    // Put the name of the scene first.
    if (this.name) {
      jsonData.name = this.name;
    }

    // And then the module definitions.
    if (Object.keys(this.modules).length > 0) {
      jsonData.modules = this.modules;
    }

    // Serialize the objects in the scene.
    jsonData.objs = this.objs.map(obj => obj.serialize());

    // Use approximated size of the current viewport.
    const approximatedWidth = Math.ceil(this.width / 100) * 100;
    const approximatedHeight = Math.ceil(this.height / 100) * 100;
    jsonData.width = approximatedWidth;
    jsonData.height = approximatedHeight;

    // Export the rest of non-default properties.
    const serializableDefaults = Scene.serializableDefaults;
    for (let propName in serializableDefaults) {
      if (!jsonData.hasOwnProperty(propName)) {
        const stringifiedValue = JSON.stringify(this[propName]);
        const stringifiedDefault = JSON.stringify(serializableDefaults[propName]);
        if (stringifiedValue !== stringifiedDefault) {
          jsonData[propName] = JSON.parse(stringifiedValue);
        }
      }
    }

    return JSON.stringify(jsonData, null, 2);
  }

  /**
   * Add an object to the scene.
   * @param {BaseSceneObj} obj
   */
  pushObj(obj) {
    this.objs.push(obj);
    obj.scene = this;
  }

  /**
   * Add an object to the scene at the beginning of the list.
   * @param {BaseSceneObj} obj
   */
  unshiftObj(obj) {
    this.objs.unshift(obj);
    obj.scene = this;
    
    // Update `targetObjIndex` of all handle objects.
    for (var i in this.objs) {
      if (this.objs[i].constructor.type == "Handle") {
        for (var j in this.objs[i].controlPoints) {
          this.objs[i].controlPoints[j].targetObjIndex++;
        }
      }
    }
  }

  /**
   * Remove the object at an index.
   * @param {number} index
   */
  removeObj(index) {
    for (var i = index; i < this.objs.length - 1; i++) {
      let oldObj = this.objs[i+1].serialize();
      this.objs[i] = new objTypes[oldObj.type](this, oldObj);
    }
  
    for (var i in this.objs) {
      if (this.objs[i].constructor.type == "Handle") {
        for (var j in this.objs[i].controlPoints) {
          if (this.objs[i].controlPoints[j].targetObjIndex > index) {
            this.objs[i].controlPoints[j].targetObjIndex--;
          } else if (this.objs[i].controlPoints[j].targetObjIndex == index) {
            this.objs[i].controlPoints = [];
            break;
          }
        }
      }
    }

    this.objs.length = this.objs.length - 1;
  }

  /**
   * Clone the object at an index.
   * @param {number} index
   * @returns {BaseSceneObj} The cloned object
   */
  cloneObj(index) {
    let oldObj = this.objs[index].serialize();
    this.objs[this.objs.length] = new objTypes[oldObj.type](this, oldObj);
    return this.objs[this.objs.length - 1];
  }

  /**
   * Clone the objects bound to the handle at an index.
   * @param {number} index
   */
  cloneObjsByHandle(index) {
    let handle = this.objs[index];
    if (handle.constructor.type !== "Handle") {
      return;
    }

    var indices = [];
    for (var j in handle.controlPoints) {
      if (indices.indexOf(handle.controlPoints[j].targetObjIndex) == -1) {
        indices.push(handle.controlPoints[j].targetObjIndex);
      }
    }
    //console.log(indices);
    for (var j in indices) {
      if (this.objs[indices[j]].constructor.type != "Handle") {
        this.cloneObj(indices[j]);
      }
    }
  }

  /**
   * Add a module definition.
   * @param {string} moduleName
   * @param {import('./objs/special/ModuleObj.js').ModuleDef} moduleDef
   * @returns {boolean} Whether the module is successfully added.
   */
  addModule(moduleName, moduleDef) {
    this.modules[moduleName] = moduleDef;

    // Update all module objects.
    for (let i in this.objs) {
      if (this.objs[i].constructor.type === "ModuleObj") {
        this.objs[i] = new objTypes.ModuleObj(this, this.objs[i].serialize());
      }
    }

    return true;
  }

  /**
   * Remove a given module and demodulize all corresponding module objects.
   * @param {string} moduleName 
   */
  removeModule(moduleName) {
    mainLoop: while (true) {
      for (let obj of this.objs) {
        if (obj.constructor.type === "ModuleObj" && obj.module === moduleName) {
          obj.demodulize();
          continue mainLoop;
        }
      }
      break;
    }

    delete this.modules[moduleName];
  }

  /**
   * Set the scale of the scene while keeping a given center point fixed.
   * @param {number} value - The new scale factor.
   * @param {number} centerX - The x-coordinate of the center point.
   * @param {number} centerY - The y-coordinate of the center point.
   */
  setScaleWithCenter(value, centerX, centerY) {
    const scaleChange = value - this.scale;
    this.origin.x *= value / this.scale;
    this.origin.y *= value / this.scale;
    this.origin.x -= centerX * scaleChange;
    this.origin.y -= centerY * scaleChange;
    this.scale = value;
  }

  /**
   * Perform an delayed validation on the scene and generate warnings if necessary. This method should not be called when the editing is in progress.
   */
  validateDelayed() {
    if (this.error) {
      return;
    }
    this.warning = null;
  
    // Check if there are identical optical objects
    const opticalObjs = this.opticalObjs;
  
    if (opticalObjs.length < 100) {
      const stringifiedObjs = opticalObjs.map(obj => JSON.stringify(obj));
      for (var i = 0; i < opticalObjs.length; i++) {
        for (var j = i + 1; j < opticalObjs.length; j++) {
          if (stringifiedObjs[i] == stringifiedObjs[j]) {
            this.warning = `opticalObjs[${i}]==[${j}] ${opticalObjs[i].constructor.type}: ` + getMsg('identical_optical_objects_warning');
            break;
          }
        }
      }
    }
  }
};