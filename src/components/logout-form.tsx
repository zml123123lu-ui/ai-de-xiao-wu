/** 退出登录：普通表单 POST 到 /api/logout，由服务端清掉会话并 303 回登录页。
 *  这样在任何浏览器、有没有水合都成立，也不依赖 server action 的重定向。 */
export function LogoutForm() {
  return <form action="/api/logout" method="post"><button className="text-button" type="submit">退出登录</button></form>;
}
