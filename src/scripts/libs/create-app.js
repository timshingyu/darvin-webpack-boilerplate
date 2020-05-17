import loadPolyfills from '@scripts/helpers/polyfills';

/**
 * createApp
 * @param {Object} config -
 * @param {Object} config.modules -
 * @return {Object} -
 */
export class CreateApp {
  modules = {};

  constructor(modules) {
    // await loadPolyfills(['IntersectionObserver']);

    this.registerModules(modules.modules);
    this.initAllModules();
    window.loadModule = (scope) => this.initModules(scope);
    window.loadSpecificModule = (moduleName, scope) => this.initSpecificModules(moduleName, scope);
  }

  /* --- Private methods --- */

  /**
   * loadModule
   * @param {Object} module - Module to load
   * @return {Promise<void>} Resolved when loaded
   */
  static loadModule(module) {
    const queue = [];

    if (module.features) {
      queue.push(loadPolyfills(module.features));
    }

    if (module.handler instanceof Function) {
      queue.push(module.handler().then((esModule) => {
        // eslint-disable-next-line no-param-reassign
        module.handler = esModule.default;
      }));
    }

    return Promise.all(queue);
  }

  /**
   * createModuleInstance
   * @param {Object} module -
   * @param {HTMLElement} el -
   * @return {undefined} -
   */
  static createModuleInstance(module, el) {
    try {
      const dataOptions = el.getAttribute(`data-${module.name}-options`); // Deprecated
      const scripOptions = el.querySelector(`script[data-${module.name}-options]`);
      const options = (dataOptions) ? JSON.parse(dataOptions) : scripOptions ? JSON.parse(scripOptions.textContent) : {};

      const instance = module.handler.createInstance({
        el,
        options,
      });

      // Save newly created instance
      module.instances.push({el, name: module.name, instance});
    } catch (error) {
      throw new Error('Module instantiation failed for module: ' + module.name + '\n' + error);
    }
  }

  /**
   * createIntersectionObserver
   * @param {Object} module -
   * @return {IntersectionObserver} intersectionObserver
   */
  static createIntersectionObserver(module) {
    const config = {
      rootMargin: '500px 0px 500px', // Extends IntersectionObserver by 500px on top and on bottom of viewport
      threshold: 0.01,
    };

    const observer = new IntersectionObserver(async (entries) => {
      const elements = entries.filter(entry => entry.intersectionRatio >= 0.01);

      if (elements.length) {
        await CreateApp.loadModule(module);

        elements.forEach((entry) => {
          CreateApp.createModuleInstance(module, entry.target);
          observer.unobserve(entry.target);
        });
      }

      // throw event to let AEM editor know that new module was loaded
      document.dispatchEvent(new CustomEvent('lazy-module-loaded'));
    }, config);

    return observer;
  }

  /* --- Public methods --- */
  // TODO: change class of module to MarsModuleHandler
  registerModule(name, module) {
    this.modules[name] = {
      name,
      selector: `[data-module~="${name}"]`,
      lazy: !!module.lazy, // Assign lazy when module should be lazy-initiated
      features: module.features,
      handler: module.handler ? module.handler : module, // Assign actual handler when provided an object with lazy prop
      instances: [],

      /**
       * init
       * @param {Document|HTMLElement} scope - Scope of the module that should be initiated.
       * @return {Promise} -
       */
      async init(scope) {
        let elements;

        if (scope === document) {
          elements = scope.querySelectorAll(this.selector);
        } else {
          elements = scope.parentNode && scope.parentNode.querySelectorAll(this.selector);
        }

        if (elements.length) {
          if (this.lazy) {
            if (!this.intersectionObserver) {
              // Creating a scoped IntersectionObserver for this module
              this.intersectionObserver = CreateApp.createIntersectionObserver(this);
            }

            elements.forEach((el) => {
              this.intersectionObserver.observe(el);
            });
          } else {
            await CreateApp.loadModule(this);

            elements.forEach((el) => {
              CreateApp.createModuleInstance(this, el);
            });
          }
        }
      },
    };
  }

  registerModules(modules) {
    Object.entries(modules).forEach(([name, module]) => {
      this.registerModule(name, module);
    });
  }

  initAllModules(scope = document) {
    Object.keys(this.modules).forEach((name) => {
      if (!this.modules[name]) {
        throw new Error(`The module '${name}' is not registered.`);
      }
      this.modules[name].init(scope);
    });
  }

  initSpecificModules(moduleName, scope) {
    this.modules[moduleName].init(scope);
  }

  initModules(scope) {
    this.initAllModules(scope);
  }
}
