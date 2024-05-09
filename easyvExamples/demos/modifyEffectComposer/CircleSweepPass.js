/**
 * @author huaqing / https://github.com/2912401452/
 */
THREE.CircleSweepPass = function(scene, camera, options) {
    THREE.Pass.call( this );

    this.scene = scene;
    this.camera = camera;
    options = options?options:{}
    this.center = options.center ? options.center : new THREE.Vector3(0, 0, 0)
    this.innerRadius = options.innerRadius ? options.innerRadius : 0
    this.outerRadius = options.outerRadius ? options.outerRadius : 0
    this.fillType = options.fillType ? options.fillType : 1 // pure: 0 - linear: 1
    this.fillColor = options.fillColor ? options.fillColor : new THREE.Color(1, 1, 1)

    this.depthTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight );
    this.depthTarget.texture.format = THREE.RGBFormat;
    this.depthTarget.texture.minFilter = THREE.NearestFilter;
    this.depthTarget.texture.magFilter = THREE.NearestFilter;
    this.depthTarget.texture.generateMipmaps = false;
    this.depthTarget.stencilBuffer = false;
    this.depthTarget.depthBuffer = true;
    this.depthTarget.depthTexture = new THREE.DepthTexture();
    this.depthTarget.depthTexture.type = THREE.UnsignedShortType;

    this.depthTargetFull = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight );
    this.depthTargetFull.texture.format = THREE.RGBFormat;
    this.depthTargetFull.texture.minFilter = THREE.NearestFilter;
    this.depthTargetFull.texture.magFilter = THREE.NearestFilter;
    this.depthTargetFull.texture.generateMipmaps = false;
    this.depthTargetFull.stencilBuffer = false;
    this.depthTargetFull.depthBuffer = true;
    this.depthTargetFull.depthTexture = new THREE.DepthTexture();
    this.depthTargetFull.depthTexture.type = THREE.UnsignedShortType;

    renderer.autoClear = false
    renderer.setRenderTarget( this.depthTarget );
    renderer.render(scene, camera)
    renderer.autoClear = true
    renderer.setRenderTarget( null );

    renderer.setRenderTarget( this.depthTargetFull );
    renderer.render(scene, camera)
    renderer.autoClear = true
    renderer.setRenderTarget( null );

    let { uProjectionInverse, uMatrixWorld } = this.depthMaterial = this.getDepthMaterial();
    this.depthMaterial.uniforms[ "fillColor" ].value = this.fillColor
    this.depthMaterial.uniforms[ "uProjectionInverse" ].value = uProjectionInverse
    this.depthMaterial.uniforms[ "uMatrixWorld" ].value = uMatrixWorld

    this.fsQuad = new THREE.Pass.FullScreenQuad( this.depthMaterial );
}

THREE.CircleSweepPass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {
    constructor: THREE.CircleSweepPass,
    render: function(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        
        this.depthMaterial.uniforms[ "colorTexture" ].value = readBuffer.texture;

        this.depthMaterial.uniforms[ "uProjectionInverse" ].value = this.camera.projectionMatrixInverse;
        this.depthMaterial.uniforms[ "uMatrixWorld" ].value = this.camera.matrixWorld;
        
        //仅扫光cube
        renderer.setRenderTarget( this.depthTarget );
        const testSearch0 = scene.getObjectByName("group");
        testSearch0.visible = true;
        const testSearch = scene.getObjectByName("a");
        testSearch.visible = false;
        renderer.render( this.scene, this.camera );
        renderer.setRenderTarget( null );
        testSearch0.visible = true;
        testSearch.visible = true;

        renderer.setRenderTarget( this.depthTargetFull );
        renderer.render( this.scene, this.camera );
        renderer.setRenderTarget( null );
        this.fsQuad.render( renderer );

    },
    getDepthMaterial: function() {
        return new THREE.ShaderMaterial( {
            uniforms: {
                "depthTextureFull": { value: this.depthTargetFull.depthTexture },
                "colorTexture": { value: null },
                "depthTexture": { value: this.depthTarget.depthTexture },
                "center": { value: this.center },
                "innerRadius": { value: this.innerRadius },
                "outerRadius": { value: this.outerRadius },
                "fillType": { value: this.fillType },
                "fillColor": { value: this.fillColor },
                'uProjectionInverse': {value: this.uProjectionInverse},
                'uMatrixWorld': {value: this.uMatrixWorld}
            },
            transparent: true,
            vertexShader:
                `
                precision highp float;
                varying vec2 vUv;
                varying vec3 vPos;
                
                void main() {
                    vPos = position;
                    vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
            fragmentShader:
                `
                uniform sampler2D colorTexture;
                uniform sampler2D depthTexture;
                uniform sampler2D depthTextureFull;
         
                uniform vec3 center;
                uniform float innerRadius;
                uniform float outerRadius;
                uniform int fillType;
                uniform vec3 fillColor;

                varying vec3 vPos;
                varying vec2 vUv;
                uniform mat4 uProjectionInverse;
                uniform mat4 uMatrixWorld;


                vec3 WorldPosFromDepth(float depth, vec3 vPosition, mat4 projectionInverse, mat4 matrixWorld) {
                    float z = (depth - 0.5) * 2.;
                    vec4 clipSpacePosition = vec4(vPosition.xy, z, 1.0);
                    vec4 viewSpacePosition = projectionInverse * clipSpacePosition;
                    viewSpacePosition /= viewSpacePosition.w;
                    vec4 worldSpacePosition = matrixWorld * viewSpacePosition;
                    return worldSpacePosition.xyz;
                }
                

                void main() {
                    vec4 diff = texture2D( colorTexture, vUv);
                    float depth = texture2D(depthTexture, vUv).x;
                    float depthFull = texture2D(depthTextureFull, vUv).x;
                    vec3 wP = WorldPosFromDepth(depth, vPos, uProjectionInverse, uMatrixWorld);
                    float dis = distance(wP, center);
                    float circleWidth = outerRadius - innerRadius;
                    if(dis < outerRadius && dis > innerRadius) {
                        if(fillType == 1) { // pure: 0 - linear: 1
                            bool depthTest = depth > depthFull;
                            if(!depthTest) {
                                gl_FragColor = vec4(mix(diff.xyz, fillColor, (dis - innerRadius)/circleWidth), 1.0);
                            } else {
                                gl_FragColor = diff;
                            }
                        }else {
                            gl_FragColor = vec4(mix(diff.xyz, fillColor, 0.5), 1.0);
                        }
                    }else {
                        gl_FragColor = diff;
                    }
                }`
        })
    }
})