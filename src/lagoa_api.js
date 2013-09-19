/**
 * @fileOverview Declares the API namespace and base object
 * the lapi object is simply an adapter layer for the Lagoa platform. It simply wraps application level
 * interfaces (changing parameters of objects in an embed scene).
 * @todo Add platform level functionality such as assets loading, projects and user queries, etc...
 */

/**
 * @namespace lapi
 */
var lapi = {};

(function(){

  /**
   * Enum for standard console msgs.
   * @enum {string}
   */
  lapi.CONSOLE_MSGS = {
    IMMUTABLE : "cannot change this"
  };

  /**
   * @type {Number}
   * @private
   */
  lapi._cbStack = 0;

  /**
   * @type {Object}
   * @private
   */
  lapi._cbmap = {};

  /**
   * @type {String}
   * @private
   */
  lapi._lagoaUrl="http://lagoa.com";

  /**
   * @type {number}
   * @private
   */
  lapi._user_id = 24;

  /**
   * @type {number}
   * @private
   */
  lapi._project_id;

  /**
   * @type {string}
   * @private
   */
  lapi._assetGuid;

  /**
   * @type {object}
   * @private
   */
  lapi._objData = {};

  /**
   * @type {{}}
   * @private
   */
  lapi._sceneTimer;

  window.addEventListener("message", function(e){
    var retval = JSON.parse(e.data);
    if(retval.channel == 'rpcend') {

//      console.warn("returning RPC call", lapi._cbStack);
//      --lapi._cbStack;

      if(lapi._cbmap[retval.id]){
        var callback = lapi._cbmap[retval.id];
        callback(retval);
        delete lapi._cbmap[retval.id];
      }
    }
  });

  /**
   * @type {{}}
   * @private
   */
  lapi._sceneObjects = {};

  /**
   * @type {string}
   * @private
   */
  lapi._camera = null;

  /**
   * @type {boolean}
   * @private
   */
  lapi._isRendering = false;

  /**
   * Mess with time
   * @type {boolean}
   * @private
   */
  lapi._isPlaying = false;

  /**
   * @type {number}
   * @private
   */
  lapi._frame = 0;

  /**
   * Initialize routine to cache embed scene data in local variables.
   */
  lapi.initialize = function(){

    var self = this;

    // TODO we are very selective about our local scene representation...
    // we should generalize this and
    var interestingGuids = [];

    var addGuidsToList = function ( in_response ) {
      var items = in_response.data;
      for(var i in items){
        interestingGuids.push(items[i]);
      }
    };

    // grab the things we are interested in
    lapi._embedRPC( "Object.keys(ACTIVEAPP.GetClassedItems()['MeshID'])", addGuidsToList);  //can choose MeshID, LightID, CameraID
    lapi._embedRPC( "Object.keys(ACTIVEAPP.GetClassedItems()['MaterialID'])", addGuidsToList );
    lapi._embedRPC( "Object.keys(ACTIVEAPP.GetClassedItems()['LightID'])", addGuidsToList );
    lapi._embedRPC( "Object.keys(ACTIVEAPP.GetClassedItems()['TextureID'])", addGuidsToList );
    lapi._embedRPC( "Object.keys(ACTIVEAPP.GetClassedItems()['TextureProjectionID'])", addGuidsToList );
    lapi._embedRPC( "Object.keys(ACTIVEAPP.GetClassedItems()['GroupID'])", addGuidsToList );
    lapi._embedRPC( "ACTIVEAPP.GetCamera().guid", function(e){
      self._camera = self._initializeObject( e.data );
    } );

    // TODO WARNING big hack ahead...
    // because of the nature of the async API, this initialization routine here is the "only chance"
    // we have to create an accurate copy of the scene – before any changes are made.
    setTimeout( function(){
      for(var i =0; i<interestingGuids.length; i++){
        self._initializeObject( interestingGuids[i] );
      }
    },2000);

    // TODO this setTimeout would be avoidded if we had a RPC queue.
    // run the onSceneLoaded callback
    setTimeout( function(){
      lapi.onSceneLoaded() }, 4000 );
  };

  /**
   * Build a shallow local representation of an object in the embeded scene with the same guid.
   * This is done using the SceneObject type – this local object can then be used to access properties
   * and call standard methods that are then pushed to the embed
   * @param in_object_guid
   * @returns {lapi.SceneObject}
   * @private
   */
  lapi._initializeObject = function( in_object_guid ){
    var self = this;
    var obj = new lapi.SceneObject( in_object_guid );
    self._sceneObjects[ in_object_guid ] = obj;

    return obj;
  };

  /**
   * Get an object via it's guid
   * @param in_guid
   * @returns {String}
   */
  lapi.getObjectByGuid = function(in_guid){
    return this._sceneObjects[in_guid];
  };

  lapi.getObjectByName = function( in_name ){
    var find = [];
    var sceneObjs = this._sceneObjects;
    var o;

    for( var i in sceneObjs){
      o = sceneObjs[i];
      if( in_name === o.properties.getParameter("Name").value ){
        find.push(o);
      }
    }

    return find;
  };

  lapi.getObjectByName = function( in_name ){
    var find = [];
    var sceneObjs = this._sceneObjects;
    var o;

    for( var i in sceneObjs){
      o = sceneObjs[i];
      if( in_name === o.properties.getParameter("Name").value ){
        find.push(o);
      }
    }

    return find;
  };

  /**
  * Assign value to object property .
  * @in_GUID {string} The GUID of the object we want to modify.
  * @in_property {string} The property of the object we want to modify.
  * @in_values {object} The values we are assigning.
  */
  lapi.setObjectParameter = function( in_GUID, in_property, in_values ){
    lapi._embedRPC("ACTIVEAPP.setObjectParameter('" +in_GUID + "'"
      +",{property : '" + in_property + "', value : "
      + JSON.stringify(in_values) + "});",function(in_response){
    });
  };

  /**
   * run a command on the embed – this uses a very limited interface we have...
   * via the message passing interface there is not much that can be done other than
   * call a command by it's name with no real parameters.
   * @private
   */
  lapi._runCommand = function( in_string ){
    lapi._embedRPC( "ACTIVEAPP.runCommand('" + in_string + "')" );
  };

  /**
   * Desselect all selected objects
   */
  lapi.desselectAll = function(){
    lapi._runCommand('DesselectAll');
  };

  /**
   * apply a material to an object by using their guid's
   * @param {String} in_mat_guid
   * @param {String} in_obj_guid
   */
  lapi.applyMaterialToObject = function( in_mat_guid, in_obj_guid ){
    lapi._embedRPC( "ACTIVEAPP.ApplyMaterial( {ctxt:'" + in_obj_guid + "', material:'" + in_mat_guid + "'})" );
  };

  /**
   * Apply a material to a mesh by using their names
   * @example lapi.applyMaterialToMeshByName( "Glossy Diffuse", "Sphere" );
   * @param {String} matName
   * @param {String} meshName
   */
  lapi.applyMaterialToMeshByName = function( matName, meshName ){

    // this is how we get the matGuid value when embedRPC returns
    var applyMaterial = function( in_embedRPC_message ){

      console.log('embedRPC return', in_embedRPC_message);

      // get the guid from the returned message
      var matGuid = in_embedRPC_message.data.value;

      // call the apply material that takes a guid and a guid.
      lapi.applyMaterialToObject( matGuid, lapi.getObjectByName( meshName ).guid );
    }

    // go through the API embed call
    lapi._embedRPC( "ACTIVEAPP.GetScene().GetObjectByName('"+matName+"').PropertySet.getParameter('guid');" ,applyMaterial);

  };

  /**
   * Get PropertySet of an object
   * @param {String} in_object_guid
   */
  lapi.getProperties = function( in_object_guid ){
    function cb( in_embedRPC_message ){
      in_rtn = in_embedRPC_message.data;
    }

    lapi._embedRPC( "ACTIVEAPP.GetScene().GetByGUID('"+in_object_guid+"').PropertySet.flatten()" , cb);
  };

 /**
 * isRendering
 * @returns {Boolean} rendering status
 */
  lapi.isRendering = function(){
    return this._isRendering;
  };

  /**
  * startRender in the embeded scene
  */
  lapi.startRender = function(){
    this._isRendering = true;
    lapi._embedRPC("ACTIVEAPP.StartRender()");
  };

  /**
   * stopRender in the embeded scene
   */
  lapi.stopRender = function(){
    this._isRendering = false;
    lapi._embedRPC("ACTIVEAPP.StopRender()");
  },

  /**
   * get active camera from the embed
   * return {SceneObject} of camera
   */
  lapi.getCamera = function(){ return this._camera; },
  lapi.isPlaying = function(){ return this._isPlaying; },
  lapi.stop = function(){ this._isPlaying = false; },
  lapi.play = function(){

    // abort early
    if (this.isPlaying()) return;

    // start some variables
    var start = null;
    var self = this;
    var intervalId = null;
    self._isPlaying = true;

    // creat tthe play routine
    function doStep(){
      ++self._frame;
      if (self.isPlaying()) {
        self.stepCb( self._frame );
      }
      else{
        clearInterval(intervalId);
      }
    }

    // start play
    var intervalId = setInterval(doStep, 48);
  };

  lapi.onSceneLoaded = function(){};
  lapi.stepCb = function(){};

  /**
   * RPC call for SC to execute.
   * @message {string} instructions we want to execute
   * @callback {function} Optional callback. It will use whatever the RPC call returns. Note, that RPC
   * return value is a stringified object we parse. It's not returning a proxy or the actual object.
   * Interactions with the scene will happen only through embedRPC calls.
   */
  lapi._embedRPC = function(message, callback){
    var randName = 'xxxxxxxxxx'.replace(/x/g,function(){return Math.floor(Math.random()*16).toString(16)});
    var iframe = document.getElementById('lagoaframe');
    if(callback){
      lapi._cbmap[randName] = callback;
//      lapi._cbStack++;    // the messages are emitted here, we want to keep a count
    }
    iframe.contentWindow.postMessage(JSON.stringify({channel : 'embedrpc', id: randName, command : message}), '*');
    console.warn("API: "+ message);
  };

  // Make sure that the whole scene is loaded! Only then can you  set the first object selection.
  // This happens because we want the user to have a reference object to guide them.
  $(function() {
    function checkLoaded(){
//      console.warn("waiting for scene to load...");
      lapi._embedRPC("ACTIVEAPP.getSceneLoaded();", function(in_response) {
        if (in_response.data === true){
          clearInterval(timer);
          lapi.initialize();
        }
      });
    }
    var timer = setInterval(checkLoaded,3000);
  });

})();