(function(){"use strict";const g="WEBPAY_UI_MESSAGE";class v{static sendMessage(l){const{target:s,targetOrigin:m,messageType:p,data:y}=l,f={key:g,messageType:p,data:y};s.postMessage(f,m)}static getBusMessage(l){try{const s=l.data;return s===null||typeof s!="object"||s.key!=g?null:s}catch{return null}}}const w=`${(()=>{const d=document.currentScript;if(d instanceof HTMLScriptElement&&d.src)return new URL(d.src).origin;const l=Array.from(document.scripts).find(s=>s.src?new URL(s.src).pathname.endsWith("/inline-checkout.js"):!1);if(l!=null&&l.src)return new URL(l.src).origin;throw new Error("WebPay inline checkout could not determine its script origin. Load it with a script src URL.")})()}/collections/w/pay`;(function(){var d="webpay-checkout-container",l="close-control",s="webay-checkout-close-control",m="webay-checkout-loader-styles",p="webay-checkout-loader",y="webayCheckoutLoaderAnimation",f=null;function x(){var e=document.createElement("div");return e.id=d,e.style.position="fixed",e.style.top="0px",e.style.left="0px",e.style.width="100%",e.style.height="100%",e.style.zIndex="999999999",e.style.backgroundColor="rgba(8, 8, 8, 0.8)",e}function E(){var e=document.createElement("div");e.id=s,e.className=l,e.style.position="absolute",e.style.top="0px",e.style.right="0px",e.style.width="50px",e.style.height="50px",e.style.display="flex",e.style.flexDirection="row",e.style.justifyContent="center",e.style.alignItems="center",e.style.cursor="pointer",e.style.zIndex="30";var t=`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Capa_1" x="0px" y="0px" width="357px" height="357px" viewBox="0 0 357 357" style="enable-background:new 0 0 357 357;width: 10px;height: 10px;fill: white;" xml:space="preserve">
        <g>
          <g id="close">
            <polygon points="357,35.7 321.3,0 178.5,142.8 35.7,0 0,35.7 142.8,178.5 0,321.3 35.7,357 178.5,214.2 321.3,357 357,321.3     214.2,178.5   "></polygon>
          </g>
        </g>
      </svg>`;return e.innerHTML=t,e}function b(){var e=12,t=1,r=document.createElement("div");r.id=p;for(var a="",n=0;n<e;n++){var o=360/e*n,i=(n+1)/e-t;a+=`
      <div style="transform: rotate(${o}deg); animation-delay: ${i}s">
      </div>`}return r.innerHTML=a,r}function C(){var t,r,a;var e=document.createElement("style");e.id=m,document.head.appendChild(e),(t=e.sheet)==null||t.insertRule(`
      #${p} {
        position: absolute;
        top: 40%;
        left: calc(50% - 20px);;
        width: 40px;
        height: 40px;
        display: inline-block;
        transform: translate(-20px, -20px) scale(0.23) translate(20px, 20px);
        z-index: 10;
      }
    `),(r=e.sheet)==null||r.insertRule(`
      #${p} div {
        position: absolute;
        left: 95px;
        top: 35px;
        width: 10px;
        height: 30px;
        background: white;
        transform-origin: 5px 65px;
        animation: ${y} linear 1s infinite;
      }
    `),(a=e.sheet)==null||a.insertRule(`
      @keyframes ${y} {
        0% {opacity: 1;}
        100% {opacity: 0;}
      }
    `)}function _(e){var t=document.createElement("form");t.method="POST",t.action=w,t.style.display="none";for(var r in e)if(e.hasOwnProperty(r)){var a=e[r],n=document.createElement("input");n.name=r,n.value=a,t.appendChild(n)}const o="INLINE";var i=document.createElement("input");i.name="displayMode",i.value=o;var c=document.createElement("input");return c.name="siteOrigin",c.value=window.location.origin,t.appendChild(i),t.appendChild(c),t}function I(){var e=document.createElement("iframe");return e.name="webpay-inline-frame",e.style.width="100%",e.style.height="100%",e.style.border="none",e.style.position="absolute",e.style.left="0px",e.style.top="0px",e.style.zIndex="20",e}function k(e){M(e);var t=x(),r=E(),a=b(),n=I(),o=_(e);t.appendChild(r),t.appendChild(a),C(),t.appendChild(n),document.body.appendChild(t);var i=document.querySelector("#"+d+" ."+l);i==null||i.addEventListener("click",h,!1),o.target="webpay-inline-frame",document.body.appendChild(o),o.submit(),document.body.removeChild(o);var c=function(u){return L(u,e)};f=c,window.addEventListener("message",c,!1)}function L(e,t){var c,u;e.origin;var r=v.getBusMessage(e);if(r===null)return;const{messageType:a}=r;if(a==="INITIALIZED"){var n=document.querySelector("#"+p);(c=n==null?void 0:n.parentNode)==null||c.removeChild(n);var o=document.querySelector("#"+s);(u=o==null?void 0:o.parentNode)==null||u.removeChild(o);return}h();const{data:i}=r;setTimeout(()=>{t.onComplete(i)},0)}function h(){var t;var e=document.querySelector("#"+d);(t=e==null?void 0:e.parentNode)==null||t.removeChild(e),window.removeEventListener("message",f,!1)}function M(e){var t=function(T){return"Invalid value supplied for payment parameter '"+T+"'."};if(typeof e!="object")throw new Error("Invalid type passed as payment parameters. Type of 'object' expected");var r=e.merchant_code;if(typeof r!="string"||r==="")throw new Error(t("merchant_code")+" Type of 'string' or 'number' expected.");var a=e.pay_item_id;if(typeof a!="string"||a==="")throw new Error(t("pay_item_id")+" Type of 'string' or 'number' expected.");var n=e.txn_ref;if(typeof n!="string"||n==="")throw new Error(t("txn_ref")+" Type of 'string' or 'number' expected.");var o=e.amount;if((typeof o!="string"||o==="")&&typeof o!="number")throw new Error(t("amount")+" Type of 'string' or 'number' expected.");var i=e.currency;if(typeof i!="string"&&typeof i!="number"||i==="")throw new Error(t("currency")+" Type of 'string' or 'number' expected.");var c=e.site_redirect_url;if(typeof c!="string"||c==="")throw new Error(t("site_redirect_url")+" Type of 'string' expected.");var u=e.onComplete;if(typeof u!="function")throw new Error(t("onComplete")+" A function is expected.")}window.webpayCheckout=k})()})();
