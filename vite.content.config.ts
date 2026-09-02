import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({build:{outDir:'dist',emptyOutDir:false,sourcemap:true,lib:{entry:resolve(__dirname,'src/content/index.ts'),name:'JobHelperContent',formats:['iife'],fileName:()=> 'content.js'}}});
