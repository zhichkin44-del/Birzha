#!/bin/sh
# Снимки варианта: sh tools/shoot.sh a
export MSYS_NO_PATHCONV=1
V=$1; D=variants/$V; S=tools/shot-state.mjs
node $S $D/index.html $D/1280.png 1280 800 &
node $S $D/index.html $D/375.png 375 800 &
node $S $D/index.html $D/$V-product-1280.png 1280 800 --hash=#/p/vecher &
node $S $D/index.html $D/$V-product-375.png 375 800 --hash=#/p/vecher &
wait
node $S $D/index.html $D/$V-cart-1280.png 1280 800 --hash=#/cart --ls=tools/cart-$V.json &
node $S $D/index.html $D/$V-cart-375.png 375 800 --hash=#/cart --ls=tools/cart-$V.json &
node $S $D/index.html $D/$V-empty-375.png 375 800 --hash=#/cart &
node $S $D/index.html $D/$V-checkout-1280.png 1280 800 --hash=#/checkout --ls=tools/cart-$V.json "--js=document.querySelector('#order button[type=submit]').click()" &
wait
node $S $D/index.html $D/$V-checkout-375.png 375 800 --hash=#/checkout --ls=tools/cart-$V.json "--js=document.querySelector('#order button[type=submit]').click()" &
node $S $D/index.html $D/$V-done-375.png 375 800 --hash=#/checkout --ls=tools/cart-$V.json "--js=(()=>{const f=document.getElementById('order');f.name.value='Марина';f.phone.value='+7 (900) 000-00-00';f.addr.value='Казань, ул. Примерная, 1, кв. 2';f.querySelector('[name=deliv]').checked=true;f.querySelector('button[type=submit]').click()})()" &
node $S $D/index.html $D/$V-catalog-filter-375.png 375 800 "--js=document.querySelector('[data-type=wax]').click();document.getElementById('sort').value='asc';document.getElementById('sort').dispatchEvent(new Event('change',{bubbles:true}))" --full=0 --scroll=1380 &
wait
