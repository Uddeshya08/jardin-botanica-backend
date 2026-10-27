// Adapted from Jardin_Botanica_Order_Confirmation_v2.html.
// Base styles are inline; original mobile media rules are retained.
export const ORDER_CONFIRMATION_MARKUP = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Jardin Botanica — Order Confirmation (Dispatch Note Direction)</title>
  <style>
    body { margin:0; background:#e9e7df; color:#27251f; -webkit-text-size-adjust:100%; }
    table { border-collapse:collapse; border-spacing:0; }
    td { vertical-align:top; }
    .sheet { max-width:630px; margin:0 auto; width:100%; background:#f9f7f0; }
    .inner { padding-left:48px; padding-right:48px; }
    .mono { font-family:"American Typewriter", "Courier New", Courier, monospace; }
    .serif { font-family:"American Typewriter", Georgia, "Times New Roman", serif; }
    .utility { font-family:"DIN Arabic Thin", "DIN Arabic", "Trebuchet MS", Arial, sans-serif; font-weight:300; }
    .small { font-size:12px; line-height:1.7; letter-spacing:.055em; }
    .muted { color:#77766f; }
    .line { border-bottom:1px solid #4e4d46; }
    .softline { border-bottom:1px solid #b5b1a6; }
    .mark { display:inline-block; font-family:Georgia,"Times New Roman",serif; font-size:22px; line-height:1.2; letter-spacing:.13em; text-transform:uppercase; }
    .greeting { font-size:44px; line-height:1.2; letter-spacing:-.035em; }
    .intro { font-size:16px; line-height:1.85; }
    .product-name { font-size:25px; line-height:1.3; }
    .amount { font-size:16px; line-height:1.4; }
    .section { font-size:11px; letter-spacing:.14em; line-height:1.7; text-transform:uppercase; font-family:"DIN Arabic Thin", "DIN Arabic", "Trebuchet MS", Arial, sans-serif; font-weight:300; }
    .address { font-size:13px; line-height:1.9; }
    .note { font-size:15px; line-height:1.85; }
    @media screen and (max-width:650px) {
      .inner { padding-left:32px !important; padding-right:32px !important; }
      .small { font-size:10px !important; }
      .mark { font-size:18px !important; }
      .greeting { font-size:37px !important; }
      .intro { font-size:14px !important; line-height:1.9 !important; }
      .product-name { font-size:21px !important; }
      .amount { font-size:13px !important; }
      .address { font-size:12px !important; }
      .note { font-size:13px !important; }
      .section { font-size:10px !important; }
      .top { padding-top:28px !important; }
      .header-bottom { padding-bottom:25px !important; }
      .start { padding-top:28px !important; }
      .record { padding-top:32px !important; }
      .items { padding-top:32px !important; }
      .ship { padding-top:33px !important; }
      .close { padding-top:31px !important; }
    }
  </style>
</head>
<body style="margin:0; background:#e9e7df; color:#27251f; -webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" style="border-collapse:collapse; border-spacing:0;"><tr><td style="vertical-align:top;;padding:24px 0 36px;" align="center">
  <table role="presentation" class="sheet" width="630" style="border-collapse:collapse; border-spacing:0;max-width:630px; margin:0 auto; width:100%; background:#f9f7f0;">
    <tr><td class="inner top header-bottom" style="vertical-align:top;padding-left:48px; padding-right:48px;;padding-top:35px;padding-bottom:33px;">
      <table role="presentation" width="100%" class="mono small" style="border-collapse:collapse; border-spacing:0;font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:12px; line-height:1.7; letter-spacing:.055em;"><tr>
        <td style="vertical-align:top;">{{reference}}</td><td align="right" style="vertical-align:top;">{{order_date}}</td>
      </tr></table>
      <div align="center" style="padding-top:29px;padding-bottom:1px;"><img src="cid:jardin-wordmark" alt="Jardin Botanica" width="265" style="display:block;width:265px;max-width:100%;height:auto;border:0;" /></div>
    </td></tr>
    <tr><td class="inner" style="vertical-align:top;padding-left:48px; padding-right:48px;"><div class="line" style="border-bottom:1px solid #4e4d46;"></div></td></tr>
    <tr><td class="inner start" style="vertical-align:top;padding-left:48px; padding-right:48px;;padding-top:36px;">
      <div class="mono section" style="font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:11px; letter-spacing:.14em; line-height:1.7; text-transform:uppercase; font-family:&quot;DIN Arabic Thin&quot;, &quot;DIN Arabic&quot;, &quot;Trebuchet MS&quot;, Arial, sans-serif; font-weight:300;;text-align:center;">Order confirmed</div>
      <div class="serif greeting" style="font-family:&quot;American Typewriter&quot;, Georgia, &quot;Times New Roman&quot;, serif;font-size:44px; line-height:1.2; letter-spacing:-.035em;;margin-top:29px;margin-bottom:19px;">Dear {{greeting_name}},</div>
      <div class="mono intro" style="font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:16px; line-height:1.85;">Thank you for your order. We've received your selection and are preparing it with care.</div>
    </td></tr>
    <tr><td class="inner items" style="vertical-align:top;padding-left:48px; padding-right:48px;;padding-top:42px;">
      <div class="line" style="border-bottom:1px solid #4e4d46;"></div>
      {{items}}
      <div class="softline" style="border-bottom:1px solid #b5b1a6;"></div>
      <table role="presentation" width="100%" class="mono small" style="border-collapse:collapse; border-spacing:0;font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:12px; line-height:1.7; letter-spacing:.055em;;margin-top:13px;">
        <tr><td class="muted" style="vertical-align:top;color:#77766f;;padding:5px 0;">Shipping</td><td align="right" style="vertical-align:top;;padding:5px 0;">{{shipping}}</td></tr>
        {{cod_row}}
        {{discount_row}}
        <tr><td style="vertical-align:top;;padding:11px 0 4px;font-size:13px;">Total (incl. GST)</td><td align="right" style="vertical-align:top;;padding:11px 0 4px;font-size:13px;">{{total}}</td></tr>
      </table>
    </td></tr>
    {{delivery_section}}
    <tr><td class="inner close" style="vertical-align:top;padding-left:48px; padding-right:48px;;padding-top:39px;">
      <div class="line" style="border-bottom:1px solid #4e4d46;"></div>
      <div class="mono section" style="font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:11px; letter-spacing:.14em; line-height:1.7; text-transform:uppercase; font-family:&quot;DIN Arabic Thin&quot;, &quot;DIN Arabic&quot;, &quot;Trebuchet MS&quot;, Arial, sans-serif; font-weight:300;;padding-top:19px;">Next dispatch</div>
      <div class="mono note" style="font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:15px; line-height:1.85;;padding-top:10px;">We'll write again when your order leaves the Conservatory.</div>
    </td></tr>
    <tr><td class="inner" style="vertical-align:top;padding-left:48px; padding-right:48px;;padding-top:54px;padding-bottom:45px;">
      <div class="softline" style="border-bottom:1px solid #b5b1a6;"></div>
      <table role="presentation" width="100%" class="mono small muted" style="border-collapse:collapse; border-spacing:0;font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:12px; line-height:1.7; letter-spacing:.055em;color:#77766f;;margin-top:16px;"><tr>
        <td style="vertical-align:top;">PREPARED IN BHOPAL, INDIA</td>
        <td align="right" style="vertical-align:top;">HELLO@JARDINBOTANICA.COM</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>
`

export const ORDER_ITEM_MARKUP = `      <table role="presentation" width="100%" style="border-collapse:collapse; border-spacing:0;;margin-top:21px;margin-bottom:23px;"><tr>
        <td style="vertical-align:top;;width:68%;padding-right:10px;">
          <div class="serif product-name" style="font-family:&quot;American Typewriter&quot;, Georgia, &quot;Times New Roman&quot;, serif;font-size:25px; line-height:1.3;">{{product_name}}</div>
          <div class="mono small muted" style="font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:12px; line-height:1.7; letter-spacing:.055em;color:#77766f;;padding-top:8px;">{{product_details}}&nbsp;&nbsp; / &nbsp;&nbsp;QTY {{quantity}}</div>
        </td>
        <td class="mono amount" align="right" style="vertical-align:top;font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:16px; line-height:1.4;;padding-top:4px;">{{item_total}}</td>
      </tr></table>`

export const DELIVERY_MARKUP = `    <tr><td class="inner ship" style="vertical-align:top;padding-left:48px; padding-right:48px;;padding-top:43px;">
      <div class="line" style="border-bottom:1px solid #4e4d46;"></div>
      <div class="mono section" style="font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:11px; letter-spacing:.14em; line-height:1.7; text-transform:uppercase; font-family:&quot;DIN Arabic Thin&quot;, &quot;DIN Arabic&quot;, &quot;Trebuchet MS&quot;, Arial, sans-serif; font-weight:300;;padding-top:18px;">Deliver to</div>
      <div class="serif" style="font-family:&quot;American Typewriter&quot;, Georgia, &quot;Times New Roman&quot;, serif;;font-size:23px;line-height:1.4;padding-top:10px;padding-bottom:7px;">{{delivery_name}}</div>
      <div class="mono address" style="font-family:&quot;American Typewriter&quot;, &quot;Courier New&quot;, Courier, monospace;font-size:13px; line-height:1.9;">{{delivery_address}}</div>
    </td></tr>`
