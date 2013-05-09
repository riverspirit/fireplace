define('payments/payments',
    ['capabilities', 'l10n', 'notification', 'requests', 'settings', 'urls'],
    function(caps, l10n, notification, requests, settings, urls) {

    var notify = notification.notification;
    var gettext = l10n.gettext;

    function waitForPayment($def, product, webpayJWT, contribStatusURL) {
        var checkFunc = function() {
            requests.get(settings.api_url + urls.api.sign(contribStatusURL)).done(function(result) {
                if (result.status == 'complete') {
                    $def.resolve(product);
                }
            }).fail(function() {
                $def.reject(null, product, 'MKT_SERVER_ERROR');
            });
        };
        var checker = setInterval(checkFunc, 3000);
        var giveUp = setTimeout(function() {
            $def.reject(null, product, 'MKT_INSTALL_ERROR');
        }, 60000);

        checkFunc();

        $def.always(function() {
            clearTimeout(checker);
            clearTimeout(giveUp);
        });
    }

    if (settings.simulate_nav_pay && !caps.navPay) {
        navigator.mozPay = function(jwts) {
            var request = {
                onsuccess: function() {
                    console.warning('[payments][mock] handler did not define request.onsuccess');
                },
                onerror: function() {
                    console.warning('[payments][mock] handler did not define request.onerror');
                }
            };
            console.log('[payments][mock] STUB navigator.mozPay received', jwts);
            console.log('[payments][mock] calling onsuccess() in 3 seconds...');
            setTimeout(function() {
                console.log('[payments][mock] calling onsuccess()');
                request.onsuccess();
            }, 3000);
            return request;
        };
        console.log('[payments] stubbed out navigator.mozPay()');
    }

    function beginPurchase(product) {
        if (!product) return;
        var $def = $.Deferred();

        console.log('[payments] Initiating transaction');

        if (caps.navPay || settings.simulate_nav_pay) {
            requests.post(urls.api.url('prepare_nav_pay'), {app: product.slug}).done(function(result) {
                console.log('[payments] Calling mozPay with JWT: ', result.webpayJWT);
                var request = navigator.mozPay([result.webpayJWT]);
                request.onsuccess = function() {
                    console.log('[payments] navigator.mozPay success');
                    waitForPayment($def, product, result.webpayJWT, result.contribStatusURL);
                };
                request.onerror = function() {
                    if (this.error.name !== 'cancelled') {
                        console.log('navigator.mozPay error:', this.error.name);
                        notify({
                            classes: 'error',
                            message: gettext('Payment failed. Try again later.'),
                            timeout: 5000
                        });
                    }
                    $def.reject(null, product, 'MKT_CANCELLED');
                };
            }).fail(function() {
                $def.reject(null, product, 'MKT_SERVER_ERROR');
            });

        } else {
            $def.reject(null, product, 'MKT_CANCELLED');
        }

        return $def.promise();
    }

    return {
        'purchase': beginPurchase
    };
});
